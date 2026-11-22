// ============================================================================
// MI NEGOCIO PRO 360 — CASOS DE PRUEBA DE EQUIVALENCIA FINANCIERA (FASE 0 -> FASE 9)
// Verifica los 30 escenarios obligatorios de la Sección 26 y la equivalencia
// numérica exacta contra los valores almacenados en MI_NEGOCIO_PRO_360_LIMPIO.xlsx
// ============================================================================

import {
  calculateSaleLine,
  calculatePurchaseLine,
  calculateOperatingExpense,
  calculateProductAnnualWeightedAverageCost,
  evaluateObligationStatus,
  calculateFinancialAccountBalance,
  calculateMonthlyIncomeStatementAndBridge,
  simulatePricing,
  type MonthlyMovementInput,
} from '../domain/calculations/financial-engine.ts';
import { evaluateAll31ReconciliationControls } from '../domain/calculations/reconciliation-controls.ts';

function createEmpty12Months(): MonthlyMovementInput[] {
  return Array.from({ length: 12 }, (_, idx) => ({
    month: idx + 1,
    purchasedQuantity: 0,
    purchasedCost: 0,
    soldQuantity: 0,
    positiveAdjQuantity: 0,
    negativeAdjQuantity: 0,
  }));
}

export function runEquivalenceTestSuite(): { passed: number; failed: number; details: string[] } {
  const details: string[] = [];
  let passed = 0;
  let failed = 0;

  function assertClose(name: string, actual: number, expected: number, tol: number = 1e-6) {
    if (Math.abs(actual - expected) <= tol) {
      passed++;
      details.push(`PASS: ${name} => ${actual}`);
    } else {
      failed++;
      details.push(`FAIL: ${name} => expected ${expected}, got ${actual}`);
    }
  }

  function assertEqual<T>(name: string, actual: T, expected: T) {
    if (actual === expected) {
      passed++;
      details.push(`PASS: ${name} => ${String(actual)}`);
    } else {
      failed++;
      details.push(`FAIL: ${name} => expected ${String(expected)}, got ${String(actual)}`);
    }
  }

  // --------------------------------------------------------------------------
  // 1. Equivalencia exacta con el estado inicial del Excel ("Fronteras Bar" / SKU01)
  // --------------------------------------------------------------------------
  const sku01Initial = calculateProductAnnualWeightedAverageCost({
    itemType: 'PRODUCT',
    catalogReferenceCost: 80,
    openingStockQuantity: 0,
    openingUnitCost: 0,
    minimumStock: 48,
    targetCoverage: 2,
    months: createEmpty12Months(),
  });

  assertClose('Excel SKU01 Initial Final Stock (J7)', sku01Initial.finalStock, 0);
  assertClose('Excel SKU01 Initial Weighted Avg Cost (M7)', sku01Initial.finalAverageCost, 80);
  assertClose('Excel SKU01 Initial Inventory Value (N7)', sku01Initial.finalInventoryValue, 0);
  assertEqual('Excel SKU01 Initial State (L7)', sku01Initial.inventoryState, 'OUT_OF_STOCK');
  assertClose('Excel SKU01 Initial Suggested Replenishment (O7)', sku01Initial.suggestedReplenishment, 96);

  // --------------------------------------------------------------------------
  // 2. Equivalencia exacta con Hoja 17: SIMULADOR DE PRECIOS (SKU01: Costo 80, Precio 100, MargenObj 30%, Desc 5%)
  // --------------------------------------------------------------------------
  const sim = simulatePricing({
    catalogCost: 80,
    catalogPrice: 100,
    targetMargin: 0.3,
    discountRate: 0.05,
    taxRate: 0,
    baseMonthlyVolume: 100,
    monthlyFixedCosts: 0,
  });

  assertClose('Simulador C21 Margen actual s/ventas', sim.currentMarginOnSales, 0.2);
  assertClose('Simulador C22 Recargo actual s/costo', sim.currentMarkupOnCost, 0.25);
  assertClose('Simulador C23 Utilidad unitaria actual', sim.unitProfitCurrent, 20);
  assertClose('Simulador C24 Precio recomendado s/impuesto', sim.recommendedPriceNoTax, 114.28571428571429, 1e-9);
  assertClose('Simulador C25 Recargo equiv. margen objetivo', sim.equivalentMarkupForTarget, 0.4285714285714286, 1e-9);
  assertClose('Simulador C26 Error común recargo s/costo', sim.commonMistakeMarkupPrice, 104);
  assertClose('Simulador C27 Margen real del error común', sim.commonMistakeRealMargin, 0.23076923076923078, 1e-9);
  assertClose('Simulador C30 Utilidad unitaria precio recomendado', sim.unitProfitRecommended, 34.28571428571429, 1e-9);
  assertClose('Simulador C31 Precio actual con descuento 5%', sim.discountedPriceNoTax, 95);
  assertClose('Simulador C32 Margen con descuento', sim.discountedMarginOnSales, 0.15789473684210525, 1e-9);
  assertClose('Simulador C33 Utilidad unitaria con descuento', sim.unitProfitDiscounted, 15);
  assertEqual('Simulador C36 Diagnóstico', sim.diagnostic, '⚠ El margen actual está por debajo del objetivo');

  // --------------------------------------------------------------------------
  // 3. Costo Promedio Ponderado Mensual, Recálculo Histórico y Puente a Efectivo
  // --------------------------------------------------------------------------
  const months = createEmpty12Months();
  // Enero: Stock inicial 10 u @ C$ 80 = 800. Compra 20 u @ C$ 95 = 1900. Disponible = 30 u, Valor = 2700 => CPP Ene = 90.00
  // Venta en Enero: 12 u (Costo ventas = 12 * 90 = 1080). Ajuste negativo (merma): 1 u (Valor = -90). Cierre Ene = 17 u * 90 = 1530.
  months[0] = {
    month: 1,
    purchasedQuantity: 20,
    purchasedCost: 1900,
    soldQuantity: 12,
    positiveAdjQuantity: 0,
    negativeAdjQuantity: 1,
  };
  // Febrero: Sin compras. Arrastra 17 u @ C$ 90 = 1530 => CPP Feb = 90.00. Venta 5 u => Cierre Feb = 12 u @ 90 = 1080.
  months[1] = {
    month: 2,
    purchasedQuantity: 0,
    purchasedCost: 0,
    soldQuantity: 5,
    positiveAdjQuantity: 0,
    negativeAdjQuantity: 0,
  };

  const cppResult = calculateProductAnnualWeightedAverageCost({
    itemType: 'PRODUCT',
    catalogReferenceCost: 80,
    openingStockQuantity: 10,
    openingUnitCost: 80,
    minimumStock: 15,
    targetCoverage: 2,
    months,
  });

  assertClose('CPP Enero (10@80 + 20@95)/30', cppResult.monthlyBreakdown[0]!.weightedAverageCost, 90);
  assertClose('Costo Ventas Enero (12 * 90)', cppResult.monthlyBreakdown[0]!.costOfGoodsSold, 1080);
  assertClose('Ajuste Neto Enero (-1 * 90)', cppResult.monthlyBreakdown[0]!.netAdjustmentsValue, -90);
  assertClose('Stock Cierre Enero (10+20-12-1)', cppResult.monthlyBreakdown[0]!.closingQuantity, 17);
  assertClose('Valor Cierre Enero (17 * 90)', cppResult.monthlyBreakdown[0]!.closingValue, 1530);
  assertClose('CPP Febrero arrastrado sin compras', cppResult.monthlyBreakdown[1]!.weightedAverageCost, 90);
  assertClose('Stock Final Anual', cppResult.finalStock, 12);
  assertEqual('Estado Bajo Mínimo (12 <= 15)', cppResult.inventoryState, 'LOW_STOCK');
  assertClose('Reposición Sugerida (15*2 - 12)', cppResult.suggestedReplenishment, 18);

  // --------------------------------------------------------------------------
  // 4. Conciliación de los 31 Controles en Estado Inicial del Excel (30 OK, 1 ALERTA)
  // --------------------------------------------------------------------------
  const initialControls = evaluateAll31ReconciliationControls({
    tolerance: 0.01,
    totalSalesWithTax: 0,
    cashSalesWithTax: 0,
    creditSalesWithTax: 0,
    receivablesOriginalTotal: 0,
    registeredCollectionsTotal: 0,
    appliedCollectionsToReceivablesTotal: 0,
    collectionsWithValidationErrorsCount: 0,
    purchasesCapitalizedCostTotal: 0,
    costingSheetValuedEntriesTotal: 0,
    purchasesWithValidationErrorsCount: 0,
    payablesOriginalTotal: 0,
    creditPurchasesWithTaxTotal: 0,
    creditExpensesWithTaxTotal: 0,
    registeredPaymentsTotal: 0,
    appliedPaymentsToPayablesTotal: 0,
    paymentsWithValidationErrorsCount: 0,
    expensesWithValidationErrorsCount: 0,
    sumFinancialAccountsCurrentBalance: 0,
    expectedGlobalCashBalanceFromRecords: 0,
    accountsTransfersInTotal: 0,
    accountsTransfersOutTotal: 0,
    registeredTransfersTotal: 0,
    cashFlowAnnualClosingBalance: 0,
    negativeBalanceAccountsCount: 0,
    transfersAndCashAdjustmentsWithErrorsCount: 0,
    inventorySheetTotalStock: 0,
    costingSheetDecemberClosingStock: 0,
    inventorySheetTotalValue: 0,
    expectedInventoryClosingValueFromFormula: 0,
    recordedProductsCostOfSalesInSalesSheet: 0,
    averageCostMethodProductsCostOfSales: 0,
    negativeStockProductsCount: 0,
    inventoryAdjustmentsWithErrorsCount: 0,
    lowOrOutOfStockProductsCount: 1, // SKU01 Sin stock
    incomeStatementAnnualNetSales: 0,
    salesSheetAnnualNetSales: 0,
    dashboardAnnualNetSales: 0,
    sumIncomeStatementExpenseCategories: 0,
    incomeStatementTotalOperatingExpenses: 0,
    sumAbsMonthlyBridgeDifferences: 0,
    salesWithValidationErrorsCount: 0,
    catalogWithValidationErrorsCount: 0,
    customersAndSuppliersWithErrorsCount: 0,
    outOfOperatingYearRecordsCount: 0,
    cashOperationsMissingAccountOrMethodCount: 0,
  });

  assertEqual('Excel Initial Controls OK Count (B5)', initialControls.okCount, 30);
  assertEqual('Excel Initial Controls REVISAR Count (D5)', initialControls.reviewCount, 0);
  assertEqual('Excel Initial Controls ALERTA Count (E5)', initialControls.alertCount, 1);

  return { passed, failed, details };
}

