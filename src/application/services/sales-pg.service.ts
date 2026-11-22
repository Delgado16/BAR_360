import { prisma } from '@/infrastructure/database/prisma-client';
import { excelRound } from '@/domain/calculations/financial-engine';
import { type AuthenticatedTenantContext, assertTenantAccessAndPermission } from '@/domain/policies/rbac.policy';
import { InventoryPostgresService } from './inventory-pg.service';

export interface ConfirmSaleLineInput {
  productId: string;
  quantity: number;
  unitPrice?: number;
  discountPercentage?: number;
  taxProfileId: string;
}

export interface ConfirmSaleInput {
  draftSaleId?: string | null;
  tableName?: string | null;
  customerId: string;
  date: string;
  paymentCondition: 'CASH' | 'CREDIT';
  paymentMethodId?: string | null;
  financialAccountId?: string | null;
  creditDays?: number | null;
  notes?: string | null;
  idempotencyKey?: string | null;
  lines: ConfirmSaleLineInput[];
}

export interface SaveTableDraftInput {
  draftSaleId?: string | null;
  tableName: string;
  customerId: string;
  date: string;
  notes?: string | null;
  lines: ConfirmSaleLineInput[];
}

export class SalesPostgresService {
  private readonly inventoryService = new InventoryPostgresService();

  public async confirmSale(ctx: AuthenticatedTenantContext, input: ConfirmSaleInput) {
    assertTenantAccessAndPermission(ctx, ctx.tenantId, 'sales', 'CREATE');

    if (!input.lines || input.lines.length === 0) {
      throw new Error('La venta debe incluir al menos un producto o servicio.');
    }

    if (input.paymentCondition === 'CASH' && (!input.paymentMethodId || !input.financialAccountId)) {
      throw new Error('Las ventas de contado requieren método de pago y cuenta financiera.');
    }

    return prisma.$transaction(async (tx) => {
      if (input.idempotencyKey) {
        const existing = await tx.sale.findUnique({
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

      const [customer, settings, creditSettings] = await Promise.all([
        tx.customer.findFirst({ where: { id: input.customerId, tenantId: ctx.tenantId } }),
        tx.businessSettings.findUnique({ where: { tenantId: ctx.tenantId } }),
        tx.creditSettings.findUnique({ where: { tenantId: ctx.tenantId } }),
      ]);

      if (!customer) {
        throw new Error('Cliente no encontrado o pertenece a otra empresa.');
      }

      if (input.paymentMethodId) {
        const pm = await tx.paymentMethod.findFirst({
          where: { id: input.paymentMethodId, tenantId: ctx.tenantId },
        });
        if (!pm) throw new Error('Método de pago no encontrado en esta empresa.');
      }
      if (input.financialAccountId) {
        const fa = await tx.financialAccount.findFirst({
          where: { id: input.financialAccountId, tenantId: ctx.tenantId },
        });
        if (!fa) throw new Error('Cuenta financiera no encontrada en esta empresa.');
      }

      const date = new Date(input.date + 'T00:00:00Z');
      const operatingYear = date.getUTCFullYear();
      const operatingMonth = date.getUTCMonth() + 1;

      const seenProducts = new Set<string>();
      let totalGrossSubtotal = 0;
      let totalDiscount = 0;
      let totalNetSubtotal = 0;
      let totalTax = 0;
      let totalGrand = 0;
      let totalCost = 0;
      let totalGrossProfit = 0;

      const computedLines: Array<{
        lineNumber: number;
        productId: string;
        itemType: 'PRODUCT' | 'SERVICE';
        quantity: number;
        unitPrice: number;
        discountPercentage: number;
        taxProfileId: string;
        taxRateSnapshot: number;
        netSubtotal: number;
        taxAmount: number;
        lineTotal: number;
        historicalUnitCost: number;
        costTotal: number;
        grossProfit: number;
      }> = [];

      for (let idx = 0; idx < input.lines.length; idx++) {
        const line = input.lines[idx]!;
        if (seenProducts.has(line.productId)) {
          throw new Error('No se permite repetir el mismo producto en líneas separadas de la misma venta.');
        }
        seenProducts.add(line.productId);

        if (line.quantity <= 0) {
          throw new Error('La cantidad vendida debe ser mayor a cero.');
        }

        const discountPct = line.discountPercentage ?? 0;
        if (discountPct < 0 || discountPct >= 1) {
          throw new Error('El porcentaje de descuento debe estar entre 0 y < 1.');
        }

        const [product, taxProfile] = await Promise.all([
          tx.product.findFirst({
            where: { id: line.productId, tenantId: ctx.tenantId },
            include: { category: true },
          }),
          tx.taxProfile.findFirst({ where: { id: line.taxProfileId, tenantId: ctx.tenantId } }),
        ]);

        if (!product) {
          throw new Error('Producto no encontrado o pertenece a otra empresa.');
        }
        if (!taxProfile) {
          throw new Error('Perfil de impuesto no encontrado en esta empresa.');
        }

        const catLower = product.category.name.toLowerCase();
        const isKitchenPrepared =
          catLower.includes('comida') || catLower.includes('cocina') || catLower.includes('alimento');

        const { currentStock, weightedAverageCost } = await this.inventoryService.getCurrentStockAndCost(
          tx,
          ctx.tenantId,
          product.id,
          operatingYear,
          operatingMonth,
        );

        if (
          product.type === 'PRODUCT' &&
          !isKitchenPrepared &&
          !settings?.allowNegativeStock &&
          currentStock < line.quantity
        ) {
          throw new Error(
            `Stock insuficiente para ${product.sku}. Disponible: ${currentStock}, solicitado: ${line.quantity}.`,
          );
        }

        const unitPrice = line.unitPrice ?? Number(product.salePrice);
        const taxRate = Number(taxProfile.rate);
        const grossLine = excelRound(line.quantity * unitPrice, 2);
        const netLine = excelRound(line.quantity * unitPrice * (1 - discountPct), 2);
        const discLine = excelRound(grossLine - netLine, 2);
        const taxLine = excelRound(netLine * taxRate, 2);
        const lineTotal = excelRound(netLine + taxLine, 2);
        const histUnitCost = weightedAverageCost;
        const costLine = excelRound(line.quantity * histUnitCost, 4);
        const profitLine = excelRound(netLine - costLine, 4);

        totalGrossSubtotal = excelRound(totalGrossSubtotal + grossLine, 2);
        totalDiscount = excelRound(totalDiscount + discLine, 2);
        totalNetSubtotal = excelRound(totalNetSubtotal + netLine, 2);
        totalTax = excelRound(totalTax + taxLine, 2);
        totalGrand = excelRound(totalGrand + lineTotal, 2);
        totalCost = excelRound(totalCost + costLine, 4);
        totalGrossProfit = excelRound(totalGrossProfit + profitLine, 4);

        computedLines.push({
          lineNumber: idx + 1,
          productId: product.id,
          itemType: product.type,
          quantity: line.quantity,
          unitPrice,
          discountPercentage: discountPct,
          taxProfileId: taxProfile.id,
          taxRateSnapshot: taxRate,
          netSubtotal: netLine,
          taxAmount: taxLine,
          lineTotal,
          historicalUnitCost: histUnitCost,
          costTotal: costLine,
          grossProfit: profitLine,
        });
      }

      const count = await tx.sale.count({ where: { tenantId: ctx.tenantId } });
      const existingDraft = input.draftSaleId
        ? await tx.sale.findFirst({
            where: { id: input.draftSaleId, tenantId: ctx.tenantId, status: 'DRAFT' },
          })
        : null;

      const saleNumber = existingDraft?.saleNumber ?? `VTA-${String(count + 1).padStart(4, '0')}`;
      const effectiveCreditDays =
        input.paymentCondition === 'CREDIT'
          ? input.creditDays ?? customer.creditDays ?? creditSettings?.defaultCustomerCreditDays ?? 30
          : null;
      const dueDate =
        input.paymentCondition === 'CREDIT' && effectiveCreditDays !== null
          ? new Date(date.getTime() + effectiveCreditDays * 86400000)
          : null;

      let sale;
      if (existingDraft) {
        await tx.saleItem.deleteMany({ where: { saleId: existingDraft.id, tenantId: ctx.tenantId } });
        sale = await tx.sale.update({
          where: { id: existingDraft.id },
          data: {
            documentNumber: input.tableName ?? existingDraft.documentNumber,
            customerId: customer.id,
            date,
            operatingYear,
            operatingMonth,
            paymentCondition: input.paymentCondition,
            paymentStatus: input.paymentCondition === 'CASH' ? 'SETTLED' : 'PENDING',
            paymentMethodId: input.paymentCondition === 'CASH' ? input.paymentMethodId : null,
            financialAccountId: input.paymentCondition === 'CASH' ? input.financialAccountId : null,
            creditDays: effectiveCreditDays,
            dueDate,
            grossSubtotal: totalGrossSubtotal,
            discountTotal: totalDiscount,
            netSubtotal: totalNetSubtotal,
            taxTotal: totalTax,
            grandTotal: totalGrand,
            costTotal: totalCost,
            grossProfit: totalGrossProfit,
            status: 'CONFIRMED',
            notes: input.notes ?? null,
            idempotencyKey: input.idempotencyKey ?? null,
            items: {
              create: computedLines.map((l) => ({
                tenantId: ctx.tenantId,
                ...l,
              })),
            },
            statusHistory: {
              create: {
                fromStatus: 'DRAFT',
                toStatus: 'CONFIRMED',
                reason: `Cuenta cerrada${input.tableName ? ` (${input.tableName})` : ''}`,
                changedBy: ctx.userId,
              },
            },
          },
          include: { items: true },
        });
      } else {
        sale = await tx.sale.create({
          data: {
            tenantId: ctx.tenantId,
            saleNumber,
            documentNumber: input.tableName ?? null,
            customerId: customer.id,
            date,
            operatingYear,
            operatingMonth,
            paymentCondition: input.paymentCondition,
            paymentStatus: input.paymentCondition === 'CASH' ? 'SETTLED' : 'PENDING',
            paymentMethodId: input.paymentCondition === 'CASH' ? input.paymentMethodId : null,
            financialAccountId: input.paymentCondition === 'CASH' ? input.financialAccountId : null,
            creditDays: effectiveCreditDays,
            dueDate,
            grossSubtotal: totalGrossSubtotal,
            discountTotal: totalDiscount,
            netSubtotal: totalNetSubtotal,
            taxTotal: totalTax,
            grandTotal: totalGrand,
            costTotal: totalCost,
            grossProfit: totalGrossProfit,
            notes: input.notes ?? null,
            idempotencyKey: input.idempotencyKey ?? null,
            createdBy: ctx.userId,
            items: {
              create: computedLines.map((l) => ({
                tenantId: ctx.tenantId,
                ...l,
              })),
            },
            statusHistory: {
              create: {
                fromStatus: null,
                toStatus: 'CONFIRMED',
                reason: 'Venta confirmada',
                changedBy: ctx.userId,
              },
            },
          },
          include: { items: true },
        });
      }

      for (const l of computedLines) {
        if (l.itemType === 'PRODUCT') {
          await tx.inventoryMovement.create({
            data: {
              tenantId: ctx.tenantId,
              productId: l.productId,
              date,
              year: operatingYear,
              month: operatingMonth,
              movementType: 'SALE_OUT',
              quantity: l.quantity,
              unitCost: l.historicalUnitCost,
              totalCost: l.costTotal,
              sourceType: 'SALE',
              sourceId: sale.id,
              createdBy: ctx.userId,
            },
          });

          await this.inventoryService.recalculateProductMonthlyCosts(
            tx,
            ctx.tenantId,
            l.productId,
            operatingYear,
          );
        }
      }

      if (input.paymentCondition === 'CREDIT' && dueDate) {
        await tx.accountReceivable.create({
          data: {
            tenantId: ctx.tenantId,
            saleId: sale.id,
            documentNumber: saleNumber,
            customerId: customer.id,
            issueDate: date,
            dueDate,
            originalAmount: totalGrand,
            paidAmount: 0,
            balanceAmount: totalGrand,
            status: 'PENDING',
          },
        });
      } else if (input.paymentCondition === 'CASH' && input.financialAccountId) {
        await tx.cashMovement.create({
          data: {
            tenantId: ctx.tenantId,
            financialAccountId: input.financialAccountId,
            paymentMethodId: input.paymentMethodId ?? null,
            date,
            operatingYear,
            operatingMonth,
            direction: 'INFLOW',
            category: 'CASH_SALE',
            amount: totalGrand,
            sourceType: 'SALE',
            sourceId: sale.id,
            reference: saleNumber,
            description: `Venta contado ${saleNumber} (${customer.name})`,
            createdBy: ctx.userId,
          },
        });
      }

      const actor = await tx.user.findUnique({ where: { id: ctx.userId }, select: { id: true } });
      await tx.auditLog.create({
        data: {
          tenantId: ctx.tenantId,
          actorUserId: actor?.id ?? null,
          action: 'SALE_CONFIRMED',
          entityType: 'Sale',
          entityId: sale.id,
          afterJson: {
            saleNumber,
            grandTotal: totalGrand,
            costTotal: totalCost,
            grossProfit: totalGrossProfit,
          },
        },
      });

      return sale;
    }, { maxWait: 10000, timeout: 25000 });
  }

  public async cancelSale(ctx: AuthenticatedTenantContext, saleId: string, reason: string) {
    assertTenantAccessAndPermission(ctx, ctx.tenantId, 'sales', 'VOID');

    if (!reason.trim()) {
      throw new Error('El motivo de anulación es obligatorio.');
    }

    return prisma.$transaction(async (tx) => {
      const sale = await tx.sale.findFirst({
        where: { id: saleId, tenantId: ctx.tenantId },
        include: { items: true, accountReceivable: true },
      });

      if (!sale) {
        throw new Error('Venta no encontrada o pertenece a otra empresa.');
      }
      if (sale.status === 'VOIDED') {
        throw new Error('La venta ya fue anulada previamente.');
      }

      const updated = await tx.sale.update({
        where: { id: sale.id },
        data: {
          status: 'VOIDED',
          voidedBy: ctx.userId,
          voidedAt: new Date(),
          voidReason: reason.trim(),
          statusHistory: {
            create: {
              fromStatus: sale.status,
              toStatus: 'VOIDED',
              reason: reason.trim(),
              changedBy: ctx.userId,
            },
          },
        },
      });

      for (const item of sale.items) {
        if (item.itemType === 'PRODUCT') {
          await tx.inventoryMovement.create({
            data: {
              tenantId: ctx.tenantId,
              productId: item.productId,
              date: sale.date,
              year: sale.operatingYear,
              month: sale.operatingMonth,
              movementType: 'SALE_VOID_IN',
              quantity: item.quantity,
              unitCost: item.historicalUnitCost,
              totalCost: item.costTotal,
              sourceType: 'SALE_VOID',
              sourceId: sale.id,
              createdBy: ctx.userId,
            },
          });

          await this.inventoryService.recalculateProductMonthlyCosts(
            tx,
            ctx.tenantId,
            item.productId,
            sale.operatingYear,
          );
        }
      }

      if (sale.paymentCondition === 'CASH' && sale.financialAccountId) {
        await tx.cashMovement.create({
          data: {
            tenantId: ctx.tenantId,
            financialAccountId: sale.financialAccountId,
            paymentMethodId: sale.paymentMethodId,
            date: new Date(),
            operatingYear: sale.operatingYear,
            operatingMonth: sale.operatingMonth,
            direction: 'OUTFLOW',
            category: 'VOID_REVERSAL',
            amount: sale.grandTotal,
            sourceType: 'SALE_VOID',
            sourceId: sale.id,
            reference: sale.saleNumber,
            description: `Anulación de venta ${sale.saleNumber}: ${reason.trim()}`,
            createdBy: ctx.userId,
          },
        });
      } else if (sale.accountReceivable) {
        await tx.accountReceivable.update({
          where: { id: sale.accountReceivable.id },
          data: { balanceAmount: 0, status: 'SETTLED' },
        });
      }

      const actor = await tx.user.findUnique({ where: { id: ctx.userId }, select: { id: true } });
      await tx.auditLog.create({
        data: {
          tenantId: ctx.tenantId,
          actorUserId: actor?.id ?? null,
          action: 'SALE_VOIDED',
          entityType: 'Sale',
          entityId: sale.id,
          reason: reason.trim(),
          afterJson: { saleNumber: sale.saleNumber, status: 'VOIDED' },
        },
      });

      return updated;
    }, { maxWait: 10000, timeout: 25000 });
  }

  public async saveTableOrderDraft(ctx: AuthenticatedTenantContext, input: SaveTableDraftInput) {
    assertTenantAccessAndPermission(ctx, ctx.tenantId, 'sales', 'CREATE');

    if (!input.tableName.trim()) {
      throw new Error('Selecciona una mesa o barra para guardar la cuenta abierta.');
    }
    if (!input.lines || input.lines.length === 0) {
      throw new Error('Agrega al menos un producto antes de guardar la mesa.');
    }

    return prisma.$transaction(
      async (tx) => {
        const customer = await tx.customer.findFirst({
          where: { id: input.customerId, tenantId: ctx.tenantId },
        });
        if (!customer) throw new Error('Cliente no encontrado en esta empresa.');

        const date = new Date(input.date + 'T00:00:00Z');
        const operatingYear = date.getUTCFullYear();
        const operatingMonth = date.getUTCMonth() + 1;

        let totalGross = 0;
        let totalDisc = 0;
        let totalNet = 0;
        let totalTax = 0;
        let totalGrand = 0;

        const computedLines = [];
        for (let idx = 0; idx < input.lines.length; idx++) {
          const line = input.lines[idx]!;
          const [product, taxProfile] = await Promise.all([
            tx.product.findFirst({ where: { id: line.productId, tenantId: ctx.tenantId } }),
            tx.taxProfile.findFirst({ where: { id: line.taxProfileId, tenantId: ctx.tenantId } }),
          ]);
          if (!product || !taxProfile) throw new Error('Producto o impuesto inválido.');

          const unitPrice = line.unitPrice ?? Number(product.salePrice);
          const discountPct = line.discountPercentage ?? 0;
          const taxRate = Number(taxProfile.rate);
          const grossLine = excelRound(line.quantity * unitPrice, 2);
          const netLine = excelRound(line.quantity * unitPrice * (1 - discountPct), 2);
          const discLine = excelRound(grossLine - netLine, 2);
          const taxLine = excelRound(netLine * taxRate, 2);
          const lineTotal = excelRound(netLine + taxLine, 2);

          totalGross = excelRound(totalGross + grossLine, 2);
          totalDisc = excelRound(totalDisc + discLine, 2);
          totalNet = excelRound(totalNet + netLine, 2);
          totalTax = excelRound(totalTax + taxLine, 2);
          totalGrand = excelRound(totalGrand + lineTotal, 2);

          computedLines.push({
            tenantId: ctx.tenantId,
            lineNumber: idx + 1,
            productId: product.id,
            itemType: product.type,
            quantity: line.quantity,
            unitPrice,
            discountPercentage: discountPct,
            taxProfileId: taxProfile.id,
            taxRateSnapshot: taxRate,
            netSubtotal: netLine,
            taxAmount: taxLine,
            lineTotal,
            historicalUnitCost: Number(product.referenceCost),
            costTotal: excelRound(line.quantity * Number(product.referenceCost), 4),
            grossProfit: excelRound(netLine - line.quantity * Number(product.referenceCost), 4),
          });
        }

        const existing = input.draftSaleId
          ? await tx.sale.findFirst({
              where: { id: input.draftSaleId, tenantId: ctx.tenantId, status: 'DRAFT' },
            })
          : await tx.sale.findFirst({
              where: {
                tenantId: ctx.tenantId,
                status: 'DRAFT',
                documentNumber: input.tableName.trim(),
              },
            });

        if (existing) {
          await tx.saleItem.deleteMany({ where: { saleId: existing.id, tenantId: ctx.tenantId } });
          return tx.sale.update({
            where: { id: existing.id },
            data: {
              customerId: customer.id,
              date,
              operatingYear,
              operatingMonth,
              grossSubtotal: totalGross,
              discountTotal: totalDisc,
              netSubtotal: totalNet,
              taxTotal: totalTax,
              grandTotal: totalGrand,
              notes: input.notes ?? null,
              items: { create: computedLines },
            },
            include: { items: true },
          });
        }

        const count = await tx.sale.count({ where: { tenantId: ctx.tenantId } });
        const saleNumber = `MESA-${String(count + 1).padStart(4, '0')}`;

        return tx.sale.create({
          data: {
            tenantId: ctx.tenantId,
            saleNumber,
            documentNumber: input.tableName.trim(),
            customerId: customer.id,
            date,
            operatingYear,
            operatingMonth,
            paymentCondition: 'CASH',
            paymentStatus: 'PENDING',
            grossSubtotal: totalGross,
            discountTotal: totalDisc,
            netSubtotal: totalNet,
            taxTotal: totalTax,
            grandTotal: totalGrand,
            status: 'DRAFT',
            notes: input.notes ?? null,
            createdBy: ctx.userId,
            items: { create: computedLines },
          },
          include: { items: true },
        });
      },
      { maxWait: 10000, timeout: 25000 },
    );
  }
}
