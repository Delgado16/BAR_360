// ============================================================================
// MI NEGOCIO PRO 360 — FASE 3: MOTOR DE INVENTARIO, COMPRAS, AJUSTES Y COSTOS (CPP MENSUAL)
// Implementa de forma completa las hojas:
// - Hoja 6: INVENTARIO (tblInventario, stock inicial, costo inicial, entradas, salidas, ajustes,
//           stock actual, estado, CPP cierre, valor inventario, reposición sugerida, inv_Control)
// - Hoja 7: COMPRAS (tblCompras, compras contado/crédito, impuesto recuperable vs no recuperable)
// - Hoja 18 (Sección 4): tblAjustesInv (mermas, sobrantes, conteos físicos valorados a CPP del mes)
// - Hoja 20 (Filas 9..16): Conciliación mensual global de valoración de inventario
// - Hoja 21: CÁLCULO DE COSTOS (Matriz de 12 meses x N productos, recálculo histórico y cierre de período)
// ============================================================================

import {
  type AuthenticatedTenantContext,
  assertTenantAccessAndPermission,
} from '../policies/rbac.policy.ts';
import {
  excelRound,
  type InventoryStateType,
  type MonthlyCostingResult,
} from '../calculations/financial-engine.ts';
import {
  EnterpriseSaaSEngine,
  type ProductEntity,
  type PurchaseDocumentEntity,
  type InventoryAdjustmentEntity,
} from './enterprise-saas.service.ts';

export interface InventorySheetRowView {
  productId: string;
  sku: string;                      // A7: inv_SKU
  productName: string;              // B7: inv_Producto
  itemType: 'PRODUCT' | 'SERVICE';  // C7: inv_Tipo
  openingStock: number;             // D7: inv_StockIni
  openingUnitCost: number;          // E7: inv_CostoIni
  entriesFromPurchases: number;     // F7: inv_Entradas
  exitsFromSales: number;           // G7: inv_Salidas
  positiveAdjustments: number;      // H7: inv_AjPos
  negativeAdjustments: number;      // I7: inv_AjNeg
  currentStock: number;             // J7: inv_Stock = D7 + F7 - G7 + H7 - I7
  minimumStock: number;             // K7: inv_Min
  inventoryState: InventoryStateType; // L7: inv_Estado
  inventoryStateLabel: string;      // Etiqueta exacta del Excel ("Normal", "Bajo mínimo", "Sin stock", "Stock negativo", "Servicio (sin stock)")
  weightedAverageCost: number;      // M7: inv_CostoProm (CPP cierre mes 12 o mes consultado)
  inventoryValue: number;           // N7: inv_Valor
  suggestedReplenishment: number;   // O7: inv_Repos = MAX(0, ROUNDUP(K7*cfg_Cobertura - J7, 0))
  controlStatus: string;            // P7: inv_Control ("OK", "⚠ Stock negativo", "⚠ Falta costo inicial")
  criticalIndex: number | null;     // Q7: inv_IdxCrit
  monthlyCostMatrix: MonthlyCostingResult[]; // Hoja 21: CÁLCULO DE COSTOS (12 meses)
}

export interface MonthlyInventoryValuationReconciliation {
  month: number;
  openingInventoryValue: number; // CÁLCULOS!D10:O10
  purchasesInventoryCost: number; // CÁLCULOS!D11:O11
  costOfGoodsSoldMethod: number;  // CÁLCULOS!D12:O12
  netAdjustmentsValue: number;    // CÁLCULOS!D13:O13
  closingInventoryValue: number;  // CÁLCULOS!D14:O14
  verificationDiff: number;       // CÁLCULOS!D15:O15 = ROUND(D10+D11-D12+D13-D14, 2) (Debe ser 0)
  closingUnitsInStock: number;    // CÁLCULOS!D16:O16
}

export class InventoryAndCostingService {
  private closedPeriods = new Set<string>(); // `${tenantId}:${year}:${month}`
  private readonly engine: EnterpriseSaaSEngine;

  constructor(engine: EnterpriseSaaSEngine) {
    this.engine = engine;
  }

  /**
   * Actualiza el Stock Inicial y Costo Unitario Inicial de un producto al comenzar el año (Hoja INVENTARIO cols D y E),
   * disparando automáticamente el recálculo del Costo Promedio Ponderado Mensual de los 12 meses.
   */
  public setOpeningBalance(
    ctx: AuthenticatedTenantContext,
    productId: string,
    openingStockQuantity: number,
    openingUnitCost: number
  ): ProductEntity {
    assertTenantAccessAndPermission(ctx, ctx.tenantId, 'inventory', 'EDIT');
    const settings = this.engine.getTenantSettings(ctx, ctx.tenantId);
    this.assertPeriodNotClosed(ctx.tenantId, settings.operatingYear, 1);

    if (openingStockQuantity < 0 || openingUnitCost < 0) {
      throw new Error('⚠ El stock inicial y el costo unitario inicial no pueden ser negativos.');
    }

    const products = this.engine.listProducts(ctx, ctx.tenantId);
    const prod = products.find((p) => p.id === productId);
    if (!prod) throw new Error('Producto no encontrado en el catálogo de la empresa.');

    if (prod.type === 'SERVICE') {
      throw new Error('⚠ Los servicios no llevan stock inicial ni inventario.');
    }

    prod.openingStockQuantity = openingStockQuantity;
    prod.openingUnitCost = openingUnitCost;
    return prod;
  }

  /**
   * Cierra o bloquea un período mensual de valoración de inventario para impedir modificaciones retroactivas
   * sin reapertura auditada (Sección 9: "Evaluar el cierre y bloqueo de períodos").
   */
  public closeValuationPeriod(
    ctx: AuthenticatedTenantContext,
    year: number,
    month: number
  ): void {
    assertTenantAccessAndPermission(ctx, ctx.tenantId, 'inventory', 'APPROVE');
    this.closedPeriods.add(`${ctx.tenantId}:${year}:${month}`);
  }

  public reopenValuationPeriod(
    ctx: AuthenticatedTenantContext,
    year: number,
    month: number,
    justification: string
  ): void {
    assertTenantAccessAndPermission(ctx, ctx.tenantId, 'inventory', 'MANAGE');
    if (!justification || justification.trim().length < 5) {
      throw new Error('Se requiere una justificación obligatoria para reabrir un período cerrado.');
    }
    this.closedPeriods.delete(`${ctx.tenantId}:${year}:${month}`);
  }

  public assertPeriodNotClosed(tenantId: string, year: number, month: number): void {
    if (this.closedPeriods.has(`${tenantId}:${year}:${month}`)) {
      throw new Error(
        `⚠ El período contable de inventario ${year}-${String(month).padStart(2, '0')} está cerrado y bloqueado.`
      );
    }
  }

  /**
   * Registra una compra de inventario verificando que el período mensual no esté cerrado
   * y recalculando los costos promedio ponderados mensuales afectados y posteriores.
   */
  public registerPurchaseWithCostingRecalculation(
    ctx: AuthenticatedTenantContext,
    input: Parameters<EnterpriseSaaSEngine['registerPurchase']>[1]
  ): PurchaseDocumentEntity {
    const parts = input.date.split('-').map(Number);
    this.assertPeriodNotClosed(ctx.tenantId, parts[0] ?? 2026, parts[1] ?? 1);
    return this.engine.registerPurchase(ctx, input);
  }

  /**
   * Registra un ajuste de inventario (merma, sobrante, conteo físico) verificando bloqueo de período
   * y valorándolo automáticamente al Costo Promedio Ponderado del mes del ajuste (tblAjustesInv!AO7).
   */
  public registerInventoryAdjustmentWithValuation(
    ctx: AuthenticatedTenantContext,
    input: Parameters<EnterpriseSaaSEngine['registerInventoryAdjustment']>[1]
  ): InventoryAdjustmentEntity & { appliedMonthlyAvgCost: number; totalValuation: number } {
    const parts = input.date.split('-').map(Number);
    const month = parts[1] ?? 1;
    this.assertPeriodNotClosed(ctx.tenantId, parts[0] ?? 2026, month);

    const adj = this.engine.registerInventoryAdjustment(ctx, input);
    const summary = this.engine.getProductCostingSummary(ctx, input.productId);
    const monthRow = summary.monthlyBreakdown[month - 1];
    const appliedMonthlyAvgCost = monthRow ? monthRow.weightedAverageCost : 0;
    // Fórmula tblAjustesInv!AO7: =INDEX(cc_Avg, MATCH($AI7, prod_SKU, 0), MONTH($AH7)) * N($AL7) * IF(LEFT($AK7,1)="P", 1, -1)
    const sign = input.isPositive ? 1 : -1;
    const totalValuation = excelRound(appliedMonthlyAvgCost * input.quantity * sign, 4);

    return {
      ...adj,
      appliedMonthlyAvgCost,
      totalValuation,
    };
  }

  /**
   * Construye la vista completa de la Hoja 6: INVENTARIO + Hoja 20: Valoración Mensual + Hoja 21: CÁLCULO DE COSTOS.
   */
  public getInventorySheetView(ctx: AuthenticatedTenantContext): {
    kpis: {
      totalInventoryValue: number;         // A5: =SUM(inv_Valor)
      productsWithPositiveStock: number;   // C5: =COUNTIF(inv_Stock, ">0")
      lowOrOutOfStockCount: number;        // E5: =COUNTIF(inv_Estado,"Bajo mínimo")+COUNTIF(inv_Estado,"Sin stock")+COUNTIF(inv_Estado,"Stock negativo")
      totalSuggestedReplenishment: number; // G5: =SUM(inv_Repos)
    };
    rows: InventorySheetRowView[];
    criticalInventoryRows: InventorySheetRowView[];
    monthlyValuationTable: MonthlyInventoryValuationReconciliation[];
  } {
    assertTenantAccessAndPermission(ctx, ctx.tenantId, 'inventory', 'VIEW');
    const products = this.engine.listProducts(ctx, ctx.tenantId);

    let critCounter = 0;
    const rows: InventorySheetRowView[] = products.map((p) => {
      const costing = this.engine.getProductCostingSummary(ctx, p.id);

      const entriesFromPurchases = costing.monthlyBreakdown.reduce((s, m) => s + m.purchasedQuantity, 0);
      const exitsFromSales = costing.monthlyBreakdown.reduce((s, m) => s + m.soldQuantity, 0);
      const positiveAdjustments = costing.monthlyBreakdown.reduce((s, m) => s + m.positiveAdjQuantity, 0);
      const negativeAdjustments = costing.monthlyBreakdown.reduce((s, m) => s + m.negativeAdjQuantity, 0);

      let inventoryStateLabel = 'Normal';
      if (costing.inventoryState === 'SERVICE_NO_STOCK') inventoryStateLabel = 'Servicio (sin stock)';
      else if (costing.inventoryState === 'NEGATIVE_STOCK') inventoryStateLabel = 'Stock negativo';
      else if (costing.inventoryState === 'OUT_OF_STOCK') inventoryStateLabel = 'Sin stock';
      else if (costing.inventoryState === 'LOW_STOCK') inventoryStateLabel = 'Bajo mínimo';

      // Fórmula INVENTARIO!P7 (inv_Control):
      // =IF($C7<>"Producto","OK",IF($J7<0,"⚠ Stock negativo",IF(AND(N($D7)>0,N($E7)=0),"⚠ Falta costo inicial","OK")))
      let controlStatus = 'OK';
      if (p.type === 'PRODUCT') {
        if (costing.finalStock < 0) {
          controlStatus = '⚠ Stock negativo';
        } else if (p.openingStockQuantity > 0 && p.openingUnitCost === 0) {
          controlStatus = '⚠ Falta costo inicial';
        }
      }

      const isCritical =
        costing.inventoryState === 'LOW_STOCK' ||
        costing.inventoryState === 'OUT_OF_STOCK' ||
        costing.inventoryState === 'NEGATIVE_STOCK';

      let criticalIndex: number | null = null;
      if (isCritical) {
        critCounter++;
        criticalIndex = critCounter;
      }

      return {
        productId: p.id,
        sku: p.sku,
        productName: p.name,
        itemType: p.type,
        openingStock: p.openingStockQuantity,
        openingUnitCost: p.openingUnitCost,
        entriesFromPurchases,
        exitsFromSales,
        positiveAdjustments,
        negativeAdjustments,
        currentStock: costing.finalStock,
        minimumStock: p.minimumStock,
        inventoryState: costing.inventoryState,
        inventoryStateLabel,
        weightedAverageCost: costing.finalAverageCost,
        inventoryValue: excelRound(costing.finalInventoryValue, 2),
        suggestedReplenishment: costing.suggestedReplenishment,
        controlStatus,
        criticalIndex,
        monthlyCostMatrix: costing.monthlyBreakdown,
      };
    });

    // Tabla de conciliación mensual global de inventario (CÁLCULOS!D10:O16)
    const monthlyValuationTable: MonthlyInventoryValuationReconciliation[] = Array.from(
      { length: 12 },
      (_, idx) => {
        const m = idx + 1;
        const openingInventoryValue = excelRound(
          rows.reduce((s, r) => s + (r.monthlyCostMatrix[idx]?.openingValue ?? 0), 0),
          2
        );
        const purchasesInventoryCost = excelRound(
          rows.reduce((s, r) => s + (r.monthlyCostMatrix[idx]?.purchasedCost ?? 0), 0),
          2
        );
        const costOfGoodsSoldMethod = excelRound(
          rows.reduce((s, r) => s + (r.monthlyCostMatrix[idx]?.costOfGoodsSold ?? 0), 0),
          2
        );
        const netAdjustmentsValue = excelRound(
          rows.reduce((s, r) => s + (r.monthlyCostMatrix[idx]?.netAdjustmentsValue ?? 0), 0),
          2
        );
        const closingInventoryValue = excelRound(
          rows.reduce((s, r) => s + (r.monthlyCostMatrix[idx]?.closingValue ?? 0), 0),
          2
        );
        // CÁLCULOS!D15: =ROUND(D10+D11-D12+D13-D14, 2)
        const verificationDiff = excelRound(
          openingInventoryValue +
            purchasesInventoryCost -
            costOfGoodsSoldMethod +
            netAdjustmentsValue -
            closingInventoryValue,
          2
        );
        const closingUnitsInStock = rows.reduce(
          (s, r) => s + (r.monthlyCostMatrix[idx]?.closingQuantity ?? 0),
          0
        );

        return {
          month: m,
          openingInventoryValue,
          purchasesInventoryCost,
          costOfGoodsSoldMethod,
          netAdjustmentsValue,
          closingInventoryValue,
          verificationDiff,
          closingUnitsInStock,
        };
      }
    );

    const totalInventoryValue = rows.reduce((s, r) => excelRound(s + r.inventoryValue, 2), 0);
    const productsWithPositiveStock = rows.filter((r) => r.currentStock > 0).length;
    const criticalInventoryRows = rows.filter((r) => r.criticalIndex !== null);
    const totalSuggestedReplenishment = rows.reduce((s, r) => s + r.suggestedReplenishment, 0);

    return {
      kpis: {
        totalInventoryValue,
        productsWithPositiveStock,
        lowOrOutOfStockCount: criticalInventoryRows.length,
        totalSuggestedReplenishment,
      },
      rows,
      criticalInventoryRows,
      monthlyValuationTable,
    };
  }
}

