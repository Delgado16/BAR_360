import { Prisma } from '@prisma/client';
import { prisma } from '@/infrastructure/database/prisma-client';
import { excelRound } from '@/domain/calculations/financial-engine';
import { type AuthenticatedTenantContext, assertTenantAccessAndPermission } from '@/domain/policies/rbac.policy';

export interface InventoryAdjustmentInput {
  productId: string;
  date: string;
  isPositive: boolean;
  reasonType?: 'SHRINKAGE' | 'SURPLUS' | 'PHYSICAL_COUNT' | 'CORRECTION';
  quantity: number;
  reason: string;
  relatedDocumentRef?: string;
}

export class InventoryPostgresService {
  /**
   * Recalcula y persiste en `inventory_monthly_costs` los 12 meses del año
   * para un producto, siguiendo exactamente las fórmulas de CÁLCULO DE COSTOS del Excel.
   */
  public async recalculateProductMonthlyCosts(
    tx: Prisma.TransactionClient,
    tenantId: string,
    productId: string,
    year: number,
  ): Promise<void> {
    const product = await tx.product.findFirst({
      where: { id: productId, tenantId },
    });
    if (!product || product.type === 'SERVICE') {
      return;
    }

    const openingRecord = await tx.inventoryOpeningBalance.findUnique({
      where: {
        tenantId_productId_operatingYear: {
          tenantId,
          productId,
          operatingYear: year,
        },
      },
    });

    const movements = await tx.inventoryMovement.findMany({
      where: { tenantId, productId, year },
      orderBy: [{ month: 'asc' }, { date: 'asc' }, { createdAt: 'asc' }],
    });

    let openQty = openingRecord ? Number(openingRecord.quantity) : 0;
    let openVal = openingRecord ? Number(openingRecord.totalValue) : 0;
    let prevAvg = Number(product.referenceCost);

    // Si no hay saldo inicial explícito para este año, arrastrar cierre de diciembre del año anterior
    if (!openingRecord) {
      const prevYearDec = await tx.inventoryMonthlyCost.findUnique({
        where: {
          tenantId_productId_year_month: {
            tenantId,
            productId,
            year: year - 1,
            month: 12,
          },
        },
      });
      if (prevYearDec) {
        openQty = Number(prevYearDec.closingQuantity);
        openVal = Number(prevYearDec.closingValue);
        prevAvg = Number(prevYearDec.weightedAverageCost);
      }
    }

    const monthlyPayloads: Array<{
      month: number;
      openingQuantity: number;
      openingValue: number;
      purchasedQuantity: number;
      purchasedCost: number;
      weightedAverageCost: number;
      soldQuantity: number;
      costOfGoodsSold: number;
      positiveAdjQuantity: number;
      negativeAdjQuantity: number;
      netAdjustmentsValue: number;
      closingQuantity: number;
      closingValue: number;
    }> = [];

    for (let m = 1; m <= 12; m++) {
      const monthMoves = movements.filter((mv) => mv.month === m);

      let purchasedQty = 0;
      let purchasedCost = 0;
      let soldQty = 0;
      let posAdjQty = 0;
      let negAdjQty = 0;

      for (const mv of monthMoves) {
        const q = Number(mv.quantity);
        const c = Number(mv.totalCost);
        switch (mv.movementType) {
          case 'OPENING_BALANCE':
            openQty = excelRound(openQty + q, 4);
            openVal = excelRound(openVal + c, 4);
            break;
          case 'PURCHASE_IN':
            purchasedQty = excelRound(purchasedQty + q, 4);
            purchasedCost = excelRound(purchasedCost + c, 4);
            break;
          case 'PURCHASE_VOID_OUT':
            purchasedQty = excelRound(purchasedQty - q, 4);
            purchasedCost = excelRound(purchasedCost - c, 4);
            break;
          case 'SALE_OUT':
            soldQty = excelRound(soldQty + q, 4);
            break;
          case 'SALE_VOID_IN':
            soldQty = excelRound(soldQty - q, 4);
            break;
          case 'ADJUSTMENT_POSITIVE':
            posAdjQty = excelRound(posAdjQty + q, 4);
            break;
          case 'ADJUSTMENT_NEGATIVE':
            negAdjQty = excelRound(negAdjQty + q, 4);
            break;
        }
      }

      const availableQty = openQty + purchasedQty;
      const avgCost =
        availableQty > 0
          ? excelRound((openVal + purchasedCost) / availableQty, 6)
          : m === 1
            ? Number(product.referenceCost)
            : prevAvg;

      const cogs = excelRound(soldQty * avgCost, 4);
      const netAdjVal = excelRound((posAdjQty - negAdjQty) * avgCost, 4);
      const closeQty = excelRound(openQty + purchasedQty - soldQty + posAdjQty - negAdjQty, 4);
      const closeVal = excelRound(closeQty * avgCost, 4);

      monthlyPayloads.push({
        month: m,
        openingQuantity: openQty,
        openingValue: openVal,
        purchasedQuantity: purchasedQty,
        purchasedCost,
        weightedAverageCost: avgCost,
        soldQuantity: soldQty,
        costOfGoodsSold: cogs,
        positiveAdjQuantity: posAdjQty,
        negativeAdjQuantity: negAdjQty,
        netAdjustmentsValue: netAdjVal,
        closingQuantity: closeQty,
        closingValue: closeVal,
      });

      openQty = closeQty;
      openVal = closeVal;
      prevAvg = avgCost;
    }

    await Promise.all(
      monthlyPayloads.map((p) =>
        tx.inventoryMonthlyCost.upsert({
          where: {
            tenantId_productId_year_month: {
              tenantId,
              productId,
              year,
              month: p.month,
            },
          },
          update: {
            openingQuantity: p.openingQuantity,
            openingValue: p.openingValue,
            purchasedQuantity: p.purchasedQuantity,
            purchasedCost: p.purchasedCost,
            weightedAverageCost: p.weightedAverageCost,
            soldQuantity: p.soldQuantity,
            costOfGoodsSold: p.costOfGoodsSold,
            positiveAdjQuantity: p.positiveAdjQuantity,
            negativeAdjQuantity: p.negativeAdjQuantity,
            netAdjustmentsValue: p.netAdjustmentsValue,
            closingQuantity: p.closingQuantity,
            closingValue: p.closingValue,
            lastCalculatedAt: new Date(),
          },
          create: {
            tenantId,
            productId,
            year,
            ...p,
          },
        }),
      ),
    );
  }

  public async getCurrentStockAndCost(
    tx: Prisma.TransactionClient | typeof prisma,
    tenantId: string,
    productId: string,
    year: number,
    month: number,
  ): Promise<{ currentStock: number; weightedAverageCost: number }> {
    const product = await tx.product.findFirst({ where: { id: productId, tenantId } });
    if (!product) {
      throw new Error('Producto no encontrado en esta empresa.');
    }
    if (product.type === 'SERVICE') {
      return { currentStock: 0, weightedAverageCost: Number(product.referenceCost) };
    }

    const monthly = await tx.inventoryMonthlyCost.findUnique({
      where: {
        tenantId_productId_year_month: {
          tenantId,
          productId,
          year,
          month,
        },
      },
    });

    if (monthly) {
      return {
        currentStock: Number(monthly.closingQuantity),
        weightedAverageCost: Number(monthly.weightedAverageCost),
      };
    }

    const opening = await tx.inventoryOpeningBalance.findUnique({
      where: {
        tenantId_productId_operatingYear: {
          tenantId,
          productId,
          operatingYear: year,
        },
      },
    });

    return {
      currentStock: opening ? Number(opening.quantity) : 0,
      weightedAverageCost:
        opening && Number(opening.quantity) > 0
          ? Number(opening.unitCost)
          : Number(product.referenceCost),
    };
  }

  public async registerAdjustment(ctx: AuthenticatedTenantContext, input: InventoryAdjustmentInput) {
    assertTenantAccessAndPermission(ctx, ctx.tenantId, 'inventory_adjustments', 'CREATE');

    if (input.quantity <= 0) {
      throw new Error('La cantidad del ajuste debe ser mayor a cero.');
    }
    if (!input.reason.trim()) {
      throw new Error('El motivo del ajuste de inventario es obligatorio.');
    }

    const date = new Date(input.date + 'T00:00:00Z');
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth() + 1;

    return prisma.$transaction(async (tx) => {
      const [product, settings] = await Promise.all([
        tx.product.findFirst({ where: { id: input.productId, tenantId: ctx.tenantId } }),
        tx.businessSettings.findUnique({ where: { tenantId: ctx.tenantId } }),
      ]);

      if (!product) {
        throw new Error('Producto no encontrado o pertenece a otra empresa.');
      }
      if (product.type === 'SERVICE') {
        throw new Error('Los servicios no admiten ajustes de inventario.');
      }

      const { currentStock, weightedAverageCost } = await this.getCurrentStockAndCost(
        tx,
        ctx.tenantId,
        product.id,
        year,
        month,
      );

      if (!input.isPositive && !settings?.allowNegativeStock && currentStock < input.quantity) {
        throw new Error(
          `Stock insuficiente para ajuste negativo en ${product.sku}. Disponible: ${currentStock}, solicitado: ${input.quantity}.`,
        );
      }

      const count = await tx.inventoryAdjustment.count({ where: { tenantId: ctx.tenantId } });
      const adjustmentNumber = `AJI-${String(count + 1).padStart(4, '0')}`;
      const signedVal = excelRound(
        (input.isPositive ? 1 : -1) * input.quantity * weightedAverageCost,
        4,
      );

      const adjustment = await tx.inventoryAdjustment.create({
        data: {
          tenantId: ctx.tenantId,
          adjustmentNumber,
          date,
          operatingYear: year,
          operatingMonth: month,
          productId: product.id,
          isPositive: input.isPositive,
          reasonType: input.reasonType ?? 'CORRECTION',
          quantity: input.quantity,
          reason: input.reason.trim(),
          relatedDocumentRef: input.relatedDocumentRef ?? null,
          appliedMonthlyAvgCost: weightedAverageCost,
          totalValuation: signedVal,
          createdBy: ctx.userId,
        },
      });

      await tx.inventoryMovement.create({
        data: {
          tenantId: ctx.tenantId,
          productId: product.id,
          date,
          year,
          month,
          movementType: input.isPositive ? 'ADJUSTMENT_POSITIVE' : 'ADJUSTMENT_NEGATIVE',
          quantity: input.quantity,
          unitCost: weightedAverageCost,
          totalCost: Math.abs(signedVal),
          sourceType: 'ADJUSTMENT',
          sourceId: adjustment.id,
          createdBy: ctx.userId,
        },
      });

      await this.recalculateProductMonthlyCosts(tx, ctx.tenantId, product.id, year);

      const actor = await tx.user.findUnique({ where: { id: ctx.userId }, select: { id: true } });
      await tx.auditLog.create({
        data: {
          tenantId: ctx.tenantId,
          actorUserId: actor?.id ?? null,
          action: 'INVENTORY_ADJUSTMENT_CREATED',
          entityType: 'InventoryAdjustment',
          entityId: adjustment.id,
          reason: input.reason.trim(),
          afterJson: {
            adjustmentNumber,
            sku: product.sku,
            isPositive: input.isPositive,
            quantity: input.quantity,
          },
        },
      });

      return adjustment;
    }, { maxWait: 10000, timeout: 25000 });
  }

  public async listInventoryValuation(tenantId: string, year: number, month: number) {
    const [products, monthlyCosts] = await Promise.all([
      prisma.product.findMany({
        where: { tenantId, status: 'ACTIVE' },
        include: { category: true, unit: true },
        orderBy: { sku: 'asc' },
      }),
      prisma.inventoryMonthlyCost.findMany({
        where: { tenantId, year, month },
      }),
    ]);

    const costMap = new Map(monthlyCosts.map((c) => [c.productId, c]));

    return products.map((p) => {
      const mc = costMap.get(p.id);
      const stock = p.type === 'SERVICE' ? 0 : mc ? Number(mc.closingQuantity) : 0;
      const avgCost = mc ? Number(mc.weightedAverageCost) : Number(p.referenceCost);
      const totalVal = p.type === 'SERVICE' ? 0 : mc ? Number(mc.closingValue) : 0;
      const minStock = Number(p.minimumStock);

      let state: string = 'NORMAL';
      if (p.type === 'SERVICE') state = 'SERVICE_NO_STOCK';
      else if (stock < 0) state = 'NEGATIVE_STOCK';
      else if (stock === 0) state = 'OUT_OF_STOCK';
      else if (stock <= minStock) state = 'LOW_STOCK';

      return {
        productId: p.id,
        sku: p.sku,
        name: p.name,
        categoryName: p.category.name,
        type: p.type,
        unitName: p.unit.name,
        openingQuantity: mc ? Number(mc.openingQuantity) : 0,
        purchasedQuantity: mc ? Number(mc.purchasedQuantity) : 0,
        soldQuantity: mc ? Number(mc.soldQuantity) : 0,
        netAdjustmentsQuantity: mc
          ? Number(mc.positiveAdjQuantity) - Number(mc.negativeAdjQuantity)
          : 0,
        finalStock: stock,
        weightedAverageCost: avgCost,
        inventoryValue: totalVal,
        minimumStock: minStock,
        state,
      };
    });
  }
}
