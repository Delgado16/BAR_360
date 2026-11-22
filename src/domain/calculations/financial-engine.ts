// ============================================================================
// MI NEGOCIO PRO 360 — MOTOR DE CÁLCULOS PUROS DE DOMINIO
// Reproducción matemática 100% equivalente a las fórmulas de las 21 hojas del
// archivo MI_NEGOCIO_PRO_360_LIMPIO.xlsx.
// ============================================================================

export type TaxTreatmentType = 'RECOVERABLE' | 'NON_RECOVERABLE';
export type ItemType = 'PRODUCT' | 'SERVICE';
export type PaymentConditionType = 'CASH' | 'CREDIT';
export type SettlementStatusType = 'PENDING' | 'DUE_SOON' | 'PARTIAL' | 'SETTLED' | 'OVERDUE';
export type AgingBucketType = 'SETTLED' | 'CURRENT' | 'DAYS_1_30' | 'DAYS_31_60' | 'DAYS_61_90' | 'DAYS_OVER_90';
export type InventoryStateType = 'SERVICE_NO_STOCK' | 'NEGATIVE_STOCK' | 'OUT_OF_STOCK' | 'LOW_STOCK' | 'NORMAL';

/**
 * Redondeo comercial estándar a N decimales equivalente a ROUND(x, n) de Excel
 * (Half-away-from-zero, evitando imprecisiones binarias de IEEE 754).
 */
export function excelRound(value: number, decimals: number = 2): number {
  if (!Number.isFinite(value) || value === 0) return 0;
  const sign = value < 0 ? -1 : 1;
  const abs = Math.abs(value);
  const factor = Math.pow(10, decimals);
  // Sumamos Number.EPSILON proporcional para corregir casos como 1.005 * 100 = 100.49999999999999
  const rounded = Math.round((abs + Number.EPSILON) * factor) / factor;
  return sign * rounded;
}

/**
 * Redondeo hacia arriba (lejos de cero) equivalente a ROUNDUP(x, decimals) de Excel.
 */
export function excelRoundUp(value: number, decimals: number = 0): number {
  if (!Number.isFinite(value) || value === 0) return 0;
  const sign = value < 0 ? -1 : 1;
  const abs = Math.abs(value);
  const factor = Math.pow(10, decimals);
  // Evitar que un entero exacto suba por ruido de punto flotante
  const scaled = abs * factor;
  const nearInt = Math.round(scaled);
  if (Math.abs(scaled - nearInt) < 1e-9) {
    return sign * (nearInt / factor);
  }
  return sign * (Math.ceil(scaled) / factor);
}

// ============================================================================
// 1. VENTAS — Fórmulas de línea (Hoja REGISTRO DE VENTAS, cols K..P)
// ============================================================================

export interface SaleLineInput {
  quantity: number;           // G7: Cantidad (> 0)
  unitPrice: number;          // H7: Precio unitario sin impuesto (>= 0)
  discountPercentage: number; // I7: Descuento en proporción 0..1 (ej. 0.05 = 5%)
  taxRate: number;            // Tasa del perfil de impuesto en proporción 0..1 (ej. 0.15 = 15%)
  historicalUnitCost: number; // N7: Costo unitario histórico (CPP del mes o costo ref. servicio o manual)
}

export interface SaleLineCalculation {
  grossSubtotal: number;
  netSubtotal: number;  // K7: =ROUND(N($G7)*N($H7)*(1-N($I7)),2)
  taxAmount: number;    // L7: =ROUND($K7*tax_Tasa,2)
  lineTotal: number;    // M7: =$K7+$L7
  costTotal: number;    // O7: =$N7*N($G7)
  grossProfit: number;  // P7: =$K7-$O7
}

export function calculateSaleLine(input: SaleLineInput): SaleLineCalculation {
  const grossSubtotal = excelRound(input.quantity * input.unitPrice, 2);
  const netSubtotal = excelRound(input.quantity * input.unitPrice * (1 - input.discountPercentage), 2);
  const taxAmount = excelRound(netSubtotal * input.taxRate, 2);
  const lineTotal = excelRound(netSubtotal + taxAmount, 2);
  const costTotal = excelRound(input.historicalUnitCost * input.quantity, 4);
  const grossProfit = excelRound(netSubtotal - costTotal, 4);

  return {
    grossSubtotal,
    netSubtotal,
    taxAmount,
    lineTotal,
    costTotal,
    grossProfit,
  };
}

// ============================================================================
// 2. COMPRAS Y GASTOS — Tratamiento Fiscal (Hojas COMPRAS col R y GASTOS col Q)
// ============================================================================

export interface PurchaseLineInput {
  quantity: number;           // F7
  unitCost: number;           // G7
  discountPercentage: number; // H7 (0..1)
  taxRate: number;            // Tasa perfil (0..1)
  taxTreatment: TaxTreatmentType; // cfg_ImpTrat -> cfg_ImpCosto (0 o 1)
}

export interface PurchaseLineCalculation {
  netSubtotal: number;              // J7: =ROUND(N($F7)*N($G7)*(1-N($H7)),2)
  taxAmount: number;                // K7: =ROUND($J7*tax_Tasa,2)
  lineTotal: number;                // L7: =$J7+$K7
  inventoryCapitalizedCost: number; // R7: =$J7+IF(cfg_ImpCosto=1,$K7,0)
}

export function calculatePurchaseLine(input: PurchaseLineInput): PurchaseLineCalculation {
  const netSubtotal = excelRound(input.quantity * input.unitCost * (1 - input.discountPercentage), 2);
  const taxAmount = excelRound(netSubtotal * input.taxRate, 2);
  const lineTotal = excelRound(netSubtotal + taxAmount, 2);
  const impCosto = input.taxTreatment === 'NON_RECOVERABLE' ? 1 : 0;
  const inventoryCapitalizedCost = excelRound(netSubtotal + (impCosto === 1 ? taxAmount : 0), 2);

  return {
    netSubtotal,
    taxAmount,
    lineTotal,
    inventoryCapitalizedCost,
  };
}

export interface ExpenseLineInput {
  netAmount: number;              // E7: Importe sin impuesto
  taxRate: number;                // Tasa perfil (0..1)
  taxTreatment: TaxTreatmentType; // cfg_ImpTrat
}

export interface ExpenseLineCalculation {
  netAmount: number;
  taxAmount: number;             // G7: =ROUND($E7*tax_Tasa,2)
  totalAmount: number;           // H7: =$E7+$G7
  incomeStatementAmount: number; // Q7: =$E7+IF(cfg_ImpCosto=1,$G7,0)
}

export function calculateOperatingExpense(input: ExpenseLineInput): ExpenseLineCalculation {
  const netAmount = excelRound(input.netAmount, 2);
  const taxAmount = excelRound(netAmount * input.taxRate, 2);
  const totalAmount = excelRound(netAmount + taxAmount, 2);
  const impCosto = input.taxTreatment === 'NON_RECOVERABLE' ? 1 : 0;
  const incomeStatementAmount = excelRound(netAmount + (impCosto === 1 ? taxAmount : 0), 2);

  return {
    netAmount,
    taxAmount,
    totalAmount,
    incomeStatementAmount,
  };
}

// ============================================================================
// 3. INVENTARIO Y COSTO PROMEDIO PONDERADO MENSUAL (Hoja CÁLCULO DE COSTOS e INVENTARIO)
// ============================================================================

export interface MonthlyMovementInput {
  month: number;               // 1..12
  purchasedQuantity: number;   // cc_PQty[m]
  purchasedCost: number;       // cc_PCost[m] (suma de comp_CostoInv del mes)
  soldQuantity: number;        // cc_SQty[m]
  positiveAdjQuantity: number; // cc_APos[m]
  negativeAdjQuantity: number; // cc_ANeg[m]
}

export interface ProductAnnualCostingInput {
  itemType: ItemType;          // "PRODUCT" o "SERVICE"
  catalogReferenceCost: number; // D8: Costo unitario de referencia del catálogo
  openingStockQuantity: number; // E8: Stock inicial al inicio del año
  openingUnitCost: number;      // F8: Costo unitario inicial al inicio del año
  minimumStock: number;         // K7: Stock mínimo
  targetCoverage: number;       // cfg_Cobertura (por defecto 2)
  months: MonthlyMovementInput[]; // 12 meses ordenados 1..12
}

export interface MonthlyCostingResult {
  month: number;
  openingQuantity: number;     // cc_QOpen
  openingValue: number;        // cc_VOpen
  purchasedQuantity: number;   // cc_PQty
  purchasedCost: number;       // cc_PCost
  weightedAverageCost: number; // cc_Avg
  soldQuantity: number;        // cc_SQty
  costOfGoodsSold: number;     // cc_SQty * cc_Avg
  positiveAdjQuantity: number; // cc_APos
  negativeAdjQuantity: number; // cc_ANeg
  netAdjustmentsValue: number; // (cc_APos - cc_ANeg) * cc_Avg
  closingQuantity: number;     // cc_QClose = QOpen + PQty - SQty + APos - ANeg
  closingValue: number;        // cc_VClose = QClose * cc_Avg
}

export interface ProductInventorySummary {
  monthlyBreakdown: MonthlyCostingResult[];
  finalStock: number;          // inv_Stock
  finalAverageCost: number;    // inv_CostoProm (mes 12)
  finalInventoryValue: number; // inv_Valor (mes 12)
  inventoryState: InventoryStateType; // inv_Estado
  suggestedReplenishment: number;     // inv_Repos
}

/**
 * Reproduce de forma exacta la matriz de 12 meses de la hoja CÁLCULO DE COSTOS
 * y las columnas de cierre de la hoja INVENTARIO.
 */
export function calculateProductAnnualWeightedAverageCost(
  input: ProductAnnualCostingInput
): ProductInventorySummary {
  const isProduct = input.itemType === 'PRODUCT';
  const monthlyBreakdown: MonthlyCostingResult[] = [];

  let prevClosingQty = isProduct ? input.openingStockQuantity : 0;
  let prevClosingVal = isProduct ? input.openingStockQuantity * input.openingUnitCost : 0;
  let prevAvgCost = isProduct ? input.catalogReferenceCost : 0;

  for (let idx = 0; idx < input.months.length; idx++) {
    const m = input.months[idx];
    if (!m) continue;
    const openingQuantity = idx === 0 ? (isProduct ? input.openingStockQuantity : 0) : prevClosingQty;
    const openingValue = idx === 0 ? (isProduct ? input.openingStockQuantity * input.openingUnitCost : 0) : prevClosingVal;

    const purchasedQuantity = isProduct ? m.purchasedQuantity : 0;
    const purchasedCost = isProduct ? m.purchasedCost : 0;

    // Fórmula exacta de BC8 (Enero) y BD8..BN8 (Feb..Dic):
    // Enero: =IF($C8<>"Producto",0,IF(G8+AE8>0,(S8+AQ8)/(G8+AE8),$D8))
    // Feb..Dic: =IF($C8<>"Producto",0,IF(H8+AF8>0,(T8+AR8)/(H8+AF8),BC8))
    let weightedAverageCost = 0;
    if (isProduct) {
      const availableQty = openingQuantity + purchasedQuantity;
      if (availableQty > 0) {
        weightedAverageCost = (openingValue + purchasedCost) / availableQty;
      } else {
        weightedAverageCost = idx === 0 ? input.catalogReferenceCost : prevAvgCost;
      }
    }

    const soldQuantity = isProduct ? m.soldQuantity : 0;
    const positiveAdjQuantity = isProduct ? m.positiveAdjQuantity : 0;
    const negativeAdjQuantity = isProduct ? m.negativeAdjQuantity : 0;

    const closingQuantity = isProduct
      ? openingQuantity + purchasedQuantity - soldQuantity + positiveAdjQuantity - negativeAdjQuantity
      : 0;
    const closingValue = isProduct ? closingQuantity * weightedAverageCost : 0;
    const costOfGoodsSold = isProduct ? soldQuantity * weightedAverageCost : 0;
    const netAdjustmentsValue = isProduct
      ? (positiveAdjQuantity - negativeAdjQuantity) * weightedAverageCost
      : 0;

    monthlyBreakdown.push({
      month: m.month,
      openingQuantity,
      openingValue,
      purchasedQuantity,
      purchasedCost,
      weightedAverageCost,
      soldQuantity,
      costOfGoodsSold,
      positiveAdjQuantity,
      negativeAdjQuantity,
      netAdjustmentsValue,
      closingQuantity,
      closingValue,
    });

    prevClosingQty = closingQuantity;
    prevClosingVal = closingValue;
    prevAvgCost = weightedAverageCost;
  }

  const lastMonth = monthlyBreakdown[monthlyBreakdown.length - 1];
  const finalStock = isProduct ? (lastMonth ? lastMonth.closingQuantity : input.openingStockQuantity) : 0;
  const finalAverageCost = isProduct ? (lastMonth ? lastMonth.weightedAverageCost : input.catalogReferenceCost) : 0;
  const finalInventoryValue = isProduct ? (lastMonth ? lastMonth.closingValue : 0) : 0;

  // Fórmula de inv_Estado (L7):
  // =IF($C7<>"Producto","Servicio (sin stock)",IF($J7<0,"Stock negativo",IF($J7<=0,"Sin stock",IF($J7<=$K7,"Bajo mínimo","Normal"))))
  let inventoryState: InventoryStateType;
  if (!isProduct) {
    inventoryState = 'SERVICE_NO_STOCK';
  } else if (finalStock < 0) {
    inventoryState = 'NEGATIVE_STOCK';
  } else if (finalStock <= 0) {
    inventoryState = 'OUT_OF_STOCK';
  } else if (finalStock <= input.minimumStock) {
    inventoryState = 'LOW_STOCK';
  } else {
    inventoryState = 'NORMAL';
  }

  // Fórmula de inv_Repos (O7):
  // =IF(AND($C7="Producto",OR($L7="Bajo mínimo",$L7="Sin stock",$L7="Stock negativo")),MAX(0,ROUNDUP($K7*cfg_Cobertura-$J7,0)),0)
  let suggestedReplenishment = 0;
  if (
    isProduct &&
    (inventoryState === 'LOW_STOCK' ||
      inventoryState === 'OUT_OF_STOCK' ||
      inventoryState === 'NEGATIVE_STOCK')
  ) {
    suggestedReplenishment = Math.max(0, excelRoundUp(input.minimumStock * input.targetCoverage - finalStock, 0));
  }

  return {
    monthlyBreakdown,
    finalStock,
    finalAverageCost,
    finalInventoryValue,
    inventoryState,
    suggestedReplenishment,
  };
}

// ============================================================================
// 4. CUENTAS POR COBRAR Y CUENTAS POR PAGAR (Hojas 11 y 12)
// ============================================================================

export interface ObligationStatusInput {
  originalAmount: number; // F7 / G7
  appliedAmount: number;  // G7 / H7
  dueDateMs: number;      // Fecha vencimiento (UTC midnight ms)
  cutoffDateMs: number;   // cfg_Corte (UTC midnight ms)
  tolerance: number;      // cfg_Tol (por defecto 0.01)
  dueSoonDays?: number;   // Por defecto 7 días en Excel
}

export interface ObligationEvaluationResult {
  balanceAmount: number;         // H7: =ROUND(F7-G7,2)
  daysOverdue: number;           // I7: =IF(AND(H7>cfg_Tol, cfg_Corte>E7), cfg_Corte-E7, 0)
  status: SettlementStatusType;  // J7
  agingBucket: AgingBucketType;  // K7
  isOverpaid: boolean;           // L7: =IF(G7 > F7 + cfg_Tol, "⚠ Sobrecobro", "OK")
}

const MS_PER_DAY = 86_400_000;

export function evaluateObligationStatus(input: ObligationStatusInput): ObligationEvaluationResult {
  const dueSoonDays = input.dueSoonDays ?? 7;
  const balanceAmount = excelRound(input.originalAmount - input.appliedAmount, 2);
  const diffDaysFromDue = Math.floor((input.cutoffDateMs - input.dueDateMs) / MS_PER_DAY);
  const daysUntilDue = Math.floor((input.dueDateMs - input.cutoffDateMs) / MS_PER_DAY);

  const daysOverdue = balanceAmount > input.tolerance && diffDaysFromDue > 0 ? diffDaysFromDue : 0;

  // J7: =IF($H7<=cfg_Tol,"Cobrado",IF(cfg_Corte>$E7,"Vencido",IF($E7-cfg_Corte<=7,"Por vencer",IF($G7>0,"Parcial","Pendiente"))))
  let status: SettlementStatusType;
  if (balanceAmount <= input.tolerance) {
    status = 'SETTLED';
  } else if (diffDaysFromDue > 0) {
    status = 'OVERDUE';
  } else if (daysUntilDue <= dueSoonDays) {
    status = 'DUE_SOON';
  } else if (input.appliedAmount > 0) {
    status = 'PARTIAL';
  } else {
    status = 'PENDING';
  }

  // K7: =IF($H7<=cfg_Tol,"Cobrado",IF($I7=0,"Al corriente",IF($I7<=30,"1-30 días",IF($I7<=60,"31-60 días",IF($I7<=90,"61-90 días","Más de 90 días")))))
  let agingBucket: AgingBucketType;
  if (balanceAmount <= input.tolerance) {
    agingBucket = 'SETTLED';
  } else if (daysOverdue === 0) {
    agingBucket = 'CURRENT';
  } else if (daysOverdue <= 30) {
    agingBucket = 'DAYS_1_30';
  } else if (daysOverdue <= 60) {
    agingBucket = 'DAYS_31_60';
  } else if (daysOverdue <= 90) {
    agingBucket = 'DAYS_61_90';
  } else {
    agingBucket = 'DAYS_OVER_90';
  }

  const isOverpaid = input.appliedAmount > input.originalAmount + input.tolerance;

  return {
    balanceAmount,
    daysOverdue,
    status,
    agingBucket,
    isOverpaid,
  };
}

// ============================================================================
// 5. CAJA Y BANCOS Y FLUJO DE CAJA (Hojas 13 y 14)
// ============================================================================

export interface FinancialAccountMovementsInput {
  openingBalance: number;          // C7: Saldo inicial
  cashSalesCollected: number;      // L7: Ventas de contado cobradas
  creditCollections: number;       // M7: Cobros de ventas a crédito
  cashPurchasesPaid: number;       // N7: Compras de contado
  cashExpensesPaid: number;        // O7: Gastos de contado
  creditObligationsPaid: number;   // P7: Pagos de obligaciones a crédito
  transfersIn: number;             // F7: Transferencias entrantes
  transfersOut: number;            // G7: Transferencias salientes
  positiveCashAdjustments: number; // cor_Tipo = "Entrada (+)"
  negativeCashAdjustments: number; // cor_Tipo = "Salida (-)"
}

export interface FinancialAccountBalanceResult {
  totalInflows: number;       // D7 = L7 + M7
  totalOutflows: number;      // E7 = N7 + O7 + P7
  netCashAdjustments: number; // H7 = Entradas(+) - Salidas(-)
  currentBalance: number;     // I7 = C7 + D7 - E7 + F7 - G7 + H7
  hasNegativeWarning: boolean; // J7 = I7 < 0
}

export function calculateFinancialAccountBalance(
  input: FinancialAccountMovementsInput
): FinancialAccountBalanceResult {
  const totalInflows = excelRound(input.cashSalesCollected + input.creditCollections, 2);
  const totalOutflows = excelRound(
    input.cashPurchasesPaid + input.cashExpensesPaid + input.creditObligationsPaid,
    2
  );
  const netCashAdjustments = excelRound(
    input.positiveCashAdjustments - input.negativeCashAdjustments,
    2
  );
  const currentBalance = excelRound(
    input.openingBalance +
      totalInflows -
      totalOutflows +
      input.transfersIn -
      input.transfersOut +
      netCashAdjustments,
    2
  );

  return {
    totalInflows,
    totalOutflows,
    netCashAdjustments,
    currentBalance,
    hasNegativeWarning: currentBalance < 0,
  };
}

// ============================================================================
// 6. ESTADO DE RESULTADOS Y PUENTE UTILIDAD -> FLUJO DE CAJA (Hoja 15)
// ============================================================================

export interface MonthlyIncomeStatementInput {
  netSales: number;                  // D9: Ventas netas sin impuesto
  costOfSalesTotal: number;          // D10: Costo de ventas total (productos + servicios)
  serviceCostOfSales: number;        // D43: Costo directo de servicios vendidos
  operatingExpensesTotal: number;    // D27: Total gastos operativos (según tratamiento fiscal)
  netInventoryAdjustments: number;   // D28: Ajustes de inventario netos valorados a CPP
  taxCollectedOnSales: number;       // D33: Impuesto cobrado en ventas
  taxPaidOnPurchasesAndExpenses: number; // D34: Impuesto pagado en compras y gastos
  taxTreatment: TaxTreatmentType;    // cfg_ImpCosto (0 o 1)
  openingInventoryValue: number;     // CÁLCULOS!D10
  closingInventoryValue: number;     // D50 (CÁLCULOS!D14)
  prevClosingReceivables: number;    // Saldo CxC cierre mes anterior (0 para Enero)
  closingReceivables: number;        // D51: Saldo CxC cierre mes actual
  prevClosingPayables: number;       // Saldo CxP cierre mes anterior (0 para Enero)
  closingPayables: number;           // D52: Saldo CxP cierre mes actual
  netCashAdjustments: number;        // D44: Ajustes justificados de caja del mes
  actualNetCashFlow: number;         // D46: Flujo de caja neto real según hoja FLUJO DE CAJA
}

export interface MonthlyIncomeStatementResult {
  netSales: number;
  costOfSalesTotal: number;
  grossProfit: number;               // D11 = D9 - D10
  grossMargin: number;               // D12 = IF(D9>0, D11/D9, 0)
  operatingExpensesTotal: number;    // D27
  netInventoryAdjustments: number;   // D28
  estimatedOperatingProfit: number;  // D29 = D11 - D27 + D28
  operatingMargin: number;           // D30 = IF(D9>0, D29/D9, 0)
  bridgeInventoryDeltaEffect: number; // D39 = -(D50 - InvInicialMes)
  bridgeReceivablesDeltaEffect: number; // D40 = -(D51 - PrevCxC)
  bridgePayablesDeltaEffect: number;    // D41 = +(D52 - PrevCxP)
  bridgeTaxCashEffect: number;          // D42 = D33 - (1 - cfg_ImpCosto)*D34
  bridgeServiceCostEffect: number;      // D43
  bridgeCashAdjustmentsEffect: number;  // D44
  bridgeCalculatedCashFlow: number;     // D45 = SUM(D38:D44)
  bridgeReconciliationDiff: number;     // D47 = ROUND(D45 - D46, 2)
}

export function calculateMonthlyIncomeStatementAndBridge(
  input: MonthlyIncomeStatementInput
): MonthlyIncomeStatementResult {
  const grossProfit = excelRound(input.netSales - input.costOfSalesTotal, 2);
  const grossMargin = input.netSales > 0 ? grossProfit / input.netSales : 0;
  const estimatedOperatingProfit = excelRound(
    grossProfit - input.operatingExpensesTotal + input.netInventoryAdjustments,
    2
  );
  const operatingMargin = input.netSales > 0 ? estimatedOperatingProfit / input.netSales : 0;

  const impCosto = input.taxTreatment === 'NON_RECOVERABLE' ? 1 : 0;
  const bridgeInventoryDeltaEffect = -(input.closingInventoryValue - input.openingInventoryValue);
  const bridgeReceivablesDeltaEffect = -(input.closingReceivables - input.prevClosingReceivables);
  const bridgePayablesDeltaEffect = input.closingPayables - input.prevClosingPayables;
  const bridgeTaxCashEffect =
    input.taxCollectedOnSales - (1 - impCosto) * input.taxPaidOnPurchasesAndExpenses;
  const bridgeServiceCostEffect = input.serviceCostOfSales;
  const bridgeCashAdjustmentsEffect = input.netCashAdjustments;

  const bridgeCalculatedCashFlow = excelRound(
    estimatedOperatingProfit +
      bridgeInventoryDeltaEffect +
      bridgeReceivablesDeltaEffect +
      bridgePayablesDeltaEffect +
      bridgeTaxCashEffect +
      bridgeServiceCostEffect +
      bridgeCashAdjustmentsEffect,
    2
  );

  const bridgeReconciliationDiff = excelRound(
    bridgeCalculatedCashFlow - input.actualNetCashFlow,
    2
  );

  return {
    netSales: input.netSales,
    costOfSalesTotal: input.costOfSalesTotal,
    grossProfit,
    grossMargin,
    operatingExpensesTotal: input.operatingExpensesTotal,
    netInventoryAdjustments: input.netInventoryAdjustments,
    estimatedOperatingProfit,
    operatingMargin,
    bridgeInventoryDeltaEffect,
    bridgeReceivablesDeltaEffect,
    bridgePayablesDeltaEffect,
    bridgeTaxCashEffect,
    bridgeServiceCostEffect,
    bridgeCashAdjustmentsEffect,
    bridgeCalculatedCashFlow,
    bridgeReconciliationDiff,
  };
}

// ============================================================================
// 7. SIMULADOR DE PRECIOS (Hoja 17 SIMULADOR DE PRECIOS)
// ============================================================================

export interface PricingSimulationInput {
  catalogCost: number;          // C7
  simulatedCost?: number | null; // C8
  catalogPrice: number;         // C10
  simulatedPrice?: number | null; // C11
  targetMargin: number;         // C13 (0..0.95)
  discountRate: number;         // C14 (0..1)
  taxRate: number;              // C16 (0..1)
  baseMonthlyVolume: number;    // C17
  monthlyFixedCosts: number;    // C18
  volumeMultipliers?: number[]; // B40:B46 (por defecto [0.5, 0.75, 1, 1.25, 1.5, 2, 3])
}

export interface VolumeScenarioRow {
  multiplier: number;                 // B40
  units: number;                      // C40 = C17 * B40
  revenueCurrentPrice: number;        // D40 = C40 * C12
  profitCurrentPrice: number;         // E40 = C40 * C23
  revenueRecommendedPrice: number;    // F40 = C40 * C24
  profitRecommendedPrice: number;     // G40 = C40 * C30
  profitDiscountedPrice: number;      // H40 = C40 * C33
  profitMinusFixedCostsCurrent: number; // I40 = E40 - C18
}

export interface PricingSimulationResult {
  usedCost: number;                    // C9
  usedPrice: number;                   // C12
  currentMarginOnSales: number;        // C21 = IF(C12>0,(C12-C9)/C12,0)
  currentMarkupOnCost: number;         // C22 = IF(C9>0,(C12-C9)/C9,0)
  unitProfitCurrent: number;           // C23 = C12 - C9
  recommendedPriceNoTax: number;       // C24 = IF(C13<1, C9/(1-C13), 0)
  equivalentMarkupForTarget: number;   // C25 = IF(C13<1, C13/(1-C13), 0)
  commonMistakeMarkupPrice: number;    // C26 = C9*(1+C13)
  commonMistakeRealMargin: number;     // C27 = IF(C26>0,(C26-C9)/C26,0)
  recommendedPriceWithTax: number;     // C28 = C24*(1+C16)
  taxPerUnitRecommended: number;       // C29 = C24*C16
  unitProfitRecommended: number;       // C30 = C24 - C9
  discountedPriceNoTax: number;        // C31 = C12*(1-C14)
  discountedMarginOnSales: number;     // C32 = IF(C31>0,(C31-C9)/C31,0)
  unitProfitDiscounted: number;        // C33 = C31 - C9
  maxDiscountForTargetMargin: number;  // C34 = IF(C12>0, MAX(0, 1 - C24/C12), 0)
  currentPriceWithTax: number;         // C35 = C12*(1+C16)
  diagnostic: string;                  // C36
  volumeScenarios: VolumeScenarioRow[];
  breakEvenUnitsCurrent: number;       // C49 = IF(C23>0, C18/C23, 0)
  breakEvenUnitsRecommended: number;   // C50 = IF(C30>0, C18/C30, 0)
  breakEvenUnitsDiscounted: number;    // C51 = IF(C33>0, C18/C33, 0)
}

export function simulatePricing(input: PricingSimulationInput): PricingSimulationResult {
  const usedCost = input.simulatedCost !== undefined && input.simulatedCost !== null ? input.simulatedCost : input.catalogCost;
  const usedPrice = input.simulatedPrice !== undefined && input.simulatedPrice !== null ? input.simulatedPrice : input.catalogPrice;

  const currentMarginOnSales = usedPrice > 0 ? (usedPrice - usedCost) / usedPrice : 0;
  const currentMarkupOnCost = usedCost > 0 ? (usedPrice - usedCost) / usedCost : 0;
  const unitProfitCurrent = usedPrice - usedCost;

  const recommendedPriceNoTax = input.targetMargin < 1 ? usedCost / (1 - input.targetMargin) : 0;
  const equivalentMarkupForTarget = input.targetMargin < 1 ? input.targetMargin / (1 - input.targetMargin) : 0;
  const commonMistakeMarkupPrice = usedCost * (1 + input.targetMargin);
  const commonMistakeRealMargin =
    commonMistakeMarkupPrice > 0 ? (commonMistakeMarkupPrice - usedCost) / commonMistakeMarkupPrice : 0;

  const recommendedPriceWithTax = recommendedPriceNoTax * (1 + input.taxRate);
  const taxPerUnitRecommended = recommendedPriceNoTax * input.taxRate;
  const unitProfitRecommended = recommendedPriceNoTax - usedCost;

  const discountedPriceNoTax = usedPrice * (1 - input.discountRate);
  const discountedMarginOnSales =
    discountedPriceNoTax > 0 ? (discountedPriceNoTax - usedCost) / discountedPriceNoTax : 0;
  const unitProfitDiscounted = discountedPriceNoTax - usedCost;

  const maxDiscountForTargetMargin =
    usedPrice > 0 ? Math.max(0, 1 - recommendedPriceNoTax / usedPrice) : 0;
  const currentPriceWithTax = usedPrice * (1 + input.taxRate);

  const diagnostic =
    usedPrice <= 0
      ? 'Defina un precio'
      : currentMarginOnSales + 1e-12 >= input.targetMargin
        ? '✔ El margen actual cumple el objetivo'
        : '⚠ El margen actual está por debajo del objetivo';

  const multipliers = input.volumeMultipliers ?? [0.5, 0.75, 1, 1.25, 1.5, 2, 3];
  const volumeScenarios: VolumeScenarioRow[] = multipliers.map((mult) => {
    const units = input.baseMonthlyVolume * mult;
    const revenueCurrentPrice = units * usedPrice;
    const profitCurrentPrice = units * unitProfitCurrent;
    const revenueRecommendedPrice = units * recommendedPriceNoTax;
    const profitRecommendedPrice = units * unitProfitRecommended;
    const profitDiscountedPrice = units * unitProfitDiscounted;
    const profitMinusFixedCostsCurrent = profitCurrentPrice - input.monthlyFixedCosts;

    return {
      multiplier: mult,
      units,
      revenueCurrentPrice,
      profitCurrentPrice,
      revenueRecommendedPrice,
      profitRecommendedPrice,
      profitDiscountedPrice,
      profitMinusFixedCostsCurrent,
    };
  });

  const breakEvenUnitsCurrent = unitProfitCurrent > 0 ? input.monthlyFixedCosts / unitProfitCurrent : 0;
  const breakEvenUnitsRecommended =
    unitProfitRecommended > 0 ? input.monthlyFixedCosts / unitProfitRecommended : 0;
  const breakEvenUnitsDiscounted =
    unitProfitDiscounted > 0 ? input.monthlyFixedCosts / unitProfitDiscounted : 0;

  return {
    usedCost,
    usedPrice,
    currentMarginOnSales,
    currentMarkupOnCost,
    unitProfitCurrent,
    recommendedPriceNoTax,
    equivalentMarkupForTarget,
    commonMistakeMarkupPrice,
    commonMistakeRealMargin,
    recommendedPriceWithTax,
    taxPerUnitRecommended,
    unitProfitRecommended,
    discountedPriceNoTax,
    discountedMarginOnSales,
    unitProfitDiscounted,
    maxDiscountForTargetMargin,
    currentPriceWithTax,
    diagnostic,
    volumeScenarios,
    breakEvenUnitsCurrent,
    breakEvenUnitsRecommended,
    breakEvenUnitsDiscounted,
  };
}

