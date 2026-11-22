import { prisma } from '@/infrastructure/database/prisma-client';
import { excelRound } from '@/domain/calculations/financial-engine';
import { type AuthenticatedTenantContext, assertTenantAccessAndPermission } from '@/domain/policies/rbac.policy';
import { InventoryPostgresService } from './inventory-pg.service';

export interface ConfirmPurchaseInput {
  supplierId: string;
  productId: string;
  taxProfileId: string;
  date: string;
  quantity: number;
  unitCost: number;
  discountPercentage?: number;
  paymentCondition: 'CASH' | 'CREDIT';
  financialAccountId?: string | null;
  documentReference?: string | null;
  idempotencyKey?: string | null;
}

export class PurchasesPostgresService {
  private readonly inventoryService = new InventoryPostgresService();

  public async confirmPurchase(ctx: AuthenticatedTenantContext, input: ConfirmPurchaseInput) {
    assertTenantAccessAndPermission(ctx, ctx.tenantId, 'purchases', 'CREATE');

    if (input.quantity <= 0) {
      throw new Error('La cantidad comprada debe ser mayor a cero.');
    }
    if (input.unitCost < 0) {
      throw new Error('El costo unitario no puede ser negativo.');
    }

    const discountPct = input.discountPercentage ?? 0;
    if (discountPct < 0 || discountPct >= 1) {
      throw new Error('El porcentaje de descuento debe estar entre 0 y < 1.');
    }

    if (input.paymentCondition === 'CASH' && !input.financialAccountId) {
      throw new Error('Las compras de contado requieren una cuenta financiera.');
    }

    return prisma.$transaction(async (tx) => {
      if (input.idempotencyKey) {
        const existing = await tx.purchase.findUnique({
          where: {
            tenantId_idempotencyKey: {
              tenantId: ctx.tenantId,
              idempotencyKey: input.idempotencyKey,
            },
          },
          include: { items: true },
        });
        if (existing) {
          return existing;
        }
      }

      const [supplier, product, taxProfile, settings, creditSettings] = await Promise.all([
        tx.supplier.findFirst({ where: { id: input.supplierId, tenantId: ctx.tenantId } }),
        tx.product.findFirst({ where: { id: input.productId, tenantId: ctx.tenantId } }),
        tx.taxProfile.findFirst({ where: { id: input.taxProfileId, tenantId: ctx.tenantId } }),
        tx.businessSettings.findUnique({ where: { tenantId: ctx.tenantId } }),
        tx.creditSettings.findUnique({ where: { tenantId: ctx.tenantId } }),
      ]);

      if (!supplier) {
        throw new Error('Proveedor no encontrado o pertenece a otra empresa.');
      }
      if (!product) {
        throw new Error('Producto no encontrado o pertenece a otra empresa.');
      }
      if (product.type === 'SERVICE') {
        throw new Error('No se pueden registrar compras de inventario para un Servicio.');
      }
      if (!taxProfile) {
        throw new Error('Perfil de impuesto no encontrado en esta empresa.');
      }

      if (input.financialAccountId) {
        const account = await tx.financialAccount.findFirst({
          where: { id: input.financialAccountId, tenantId: ctx.tenantId },
        });
        if (!account) {
          throw new Error('Cuenta financiera no encontrada en esta empresa.');
        }
      }

      const date = new Date(input.date + 'T00:00:00Z');
      const operatingYear = date.getUTCFullYear();
      const operatingMonth = date.getUTCMonth() + 1;
      const taxRate = Number(taxProfile.rate);

      const netSubtotal = excelRound(input.quantity * input.unitCost * (1 - discountPct), 2);
      const taxAmount = excelRound(netSubtotal * taxRate, 2);
      const grandTotal = excelRound(netSubtotal + taxAmount, 2);
      const isNonRecoverable = settings?.taxTreatment === 'NON_RECOVERABLE';
      const inventoryCapitalizedCost = isNonRecoverable ? grandTotal : netSubtotal;

      const count = await tx.purchase.count({ where: { tenantId: ctx.tenantId } });
      const purchaseNumber = `COMP-${String(count + 1).padStart(4, '0')}`;
      const creditDays = supplier.creditDays ?? creditSettings?.defaultSupplierCreditDays ?? 30;
      const dueDate =
        input.paymentCondition === 'CREDIT'
          ? new Date(date.getTime() + creditDays * 86400000)
          : null;

      const purchase = await tx.purchase.create({
        data: {
          tenantId: ctx.tenantId,
          purchaseNumber,
          supplierId: supplier.id,
          date,
          operatingYear,
          operatingMonth,
          paymentCondition: input.paymentCondition,
          paymentStatus: input.paymentCondition === 'CASH' ? 'SETTLED' : 'PENDING',
          dueDate,
          financialAccountId: input.paymentCondition === 'CASH' ? input.financialAccountId : null,
          documentReference: input.documentReference ?? null,
          netSubtotal,
          taxTotal: taxAmount,
          grandTotal,
          inventoryCapitalizedCost,
          idempotencyKey: input.idempotencyKey ?? null,
          createdBy: ctx.userId,
          items: {
            create: {
              tenantId: ctx.tenantId,
              productId: product.id,
              quantity: input.quantity,
              unitCost: input.unitCost,
              discountPercentage: discountPct,
              taxProfileId: taxProfile.id,
              taxRateSnapshot: taxRate,
              netSubtotal,
              taxAmount,
              lineTotal: grandTotal,
              inventoryCapitalizedCost,
            },
          },
        },
        include: { items: true },
      });

      await tx.inventoryMovement.create({
        data: {
          tenantId: ctx.tenantId,
          productId: product.id,
          date,
          year: operatingYear,
          month: operatingMonth,
          movementType: 'PURCHASE_IN',
          quantity: input.quantity,
          unitCost: excelRound(inventoryCapitalizedCost / input.quantity, 6),
          totalCost: inventoryCapitalizedCost,
          sourceType: 'PURCHASE',
          sourceId: purchase.id,
          createdBy: ctx.userId,
        },
      });

      if (input.paymentCondition === 'CREDIT' && dueDate) {
        await tx.accountPayable.create({
          data: {
            tenantId: ctx.tenantId,
            sourceType: 'PURCHASE',
            purchaseId: purchase.id,
            documentNumber: purchaseNumber,
            supplierId: supplier.id,
            creditorName: supplier.name,
            issueDate: date,
            dueDate,
            originalAmount: grandTotal,
            paidAmount: 0,
            balanceAmount: grandTotal,
            status: 'PENDING',
          },
        });
      } else if (input.paymentCondition === 'CASH' && input.financialAccountId) {
        await tx.cashMovement.create({
          data: {
            tenantId: ctx.tenantId,
            financialAccountId: input.financialAccountId,
            date,
            operatingYear,
            operatingMonth,
            direction: 'OUTFLOW',
            category: 'CASH_PURCHASE',
            amount: grandTotal,
            sourceType: 'PURCHASE',
            sourceId: purchase.id,
            reference: purchaseNumber,
            description: `Compra contado ${purchaseNumber} (${supplier.name})`,
            createdBy: ctx.userId,
          },
        });
      }

      await this.inventoryService.recalculateProductMonthlyCosts(
        tx,
        ctx.tenantId,
        product.id,
        operatingYear,
      );

      const actor = await tx.user.findUnique({ where: { id: ctx.userId }, select: { id: true } });
      await tx.auditLog.create({
        data: {
          tenantId: ctx.tenantId,
          actorUserId: actor?.id ?? null,
          action: 'PURCHASE_CONFIRMED',
          entityType: 'Purchase',
          entityId: purchase.id,
          afterJson: {
            purchaseNumber,
            grandTotal,
            inventoryCapitalizedCost,
            paymentCondition: input.paymentCondition,
          },
        },
      });

      return purchase;
    }, { maxWait: 10000, timeout: 25000 });
  }
}
