// ============================================================================
// MI NEGOCIO PRO 360 — CENTRO DE CONTROL Y CONCILIACIÓN (31 CONTROLES DEL EXCEL)
// Reproducción exacta de la hoja 19: CONTROLES (B9:I39)
// ============================================================================

import { excelRound } from './financial-engine.ts';

export type ControlState = 'OK' | 'REVISAR' | 'ALERTA';

export type ControlArea =
  | 'Ventas y cobros'
  | 'Compras y gastos'
  | 'Caja y bancos'
  | 'Inventario'
  | 'Resultados'
  | 'Calidad de datos';

export interface ReconciliationControlResult {
  code: number;               // 1..31
  area: ControlArea;          // Col C
  description: string;        // Col D
  valueA: number;             // Col E
  valueB: number;             // Col F
  difference: number;         // Col G = ROUND(E - F, 2)
  tolerance: number;          // cfg_Tol
  state: ControlState;        // Col H: OK | REVISAR | ALERTA
  recommendedAction: string;  // Col I
}

export interface ReconciliationSnapshotInput {
  tolerance: number; // cfg_Tol (por defecto 0.01)

  // Ventas y cobros (Controles 1..4)
  totalSalesWithTax: number;
  cashSalesWithTax: number;
  creditSalesWithTax: number;
  receivablesOriginalTotal: number;
  registeredCollectionsTotal: number;
  appliedCollectionsToReceivablesTotal: number;
  collectionsWithValidationErrorsCount: number;

  // Compras y gastos (Controles 5..10)
  purchasesCapitalizedCostTotal: number;
  costingSheetValuedEntriesTotal: number;
  purchasesWithValidationErrorsCount: number;
  payablesOriginalTotal: number;
  creditPurchasesWithTaxTotal: number;
  creditExpensesWithTaxTotal: number;
  registeredPaymentsTotal: number;
  appliedPaymentsToPayablesTotal: number;
  paymentsWithValidationErrorsCount: number;
  expensesWithValidationErrorsCount: number;

  // Caja y bancos (Controles 11..16)
  sumFinancialAccountsCurrentBalance: number;
  expectedGlobalCashBalanceFromRecords: number;
  accountsTransfersInTotal: number;
  accountsTransfersOutTotal: number;
  registeredTransfersTotal: number;
  cashFlowAnnualClosingBalance: number;
  negativeBalanceAccountsCount: number;
  transfersAndCashAdjustmentsWithErrorsCount: number;

  // Inventario (Controles 17..22)
  inventorySheetTotalStock: number;
  costingSheetDecemberClosingStock: number;
  inventorySheetTotalValue: number;
  expectedInventoryClosingValueFromFormula: number; // Inicial + Compras - CostoVentasMetodo + AjustesNetos
  recordedProductsCostOfSalesInSalesSheet: number;
  averageCostMethodProductsCostOfSales: number;
  negativeStockProductsCount: number;
  inventoryAdjustmentsWithErrorsCount: number;
  lowOrOutOfStockProductsCount: number;

  // Resultados (Controles 23..26)
  incomeStatementAnnualNetSales: number;
  salesSheetAnnualNetSales: number;
  dashboardAnnualNetSales: number;
  sumIncomeStatementExpenseCategories: number;
  incomeStatementTotalOperatingExpenses: number;
  sumAbsMonthlyBridgeDifferences: number;

  // Calidad de datos (Controles 27..31)
  salesWithValidationErrorsCount: number;
  catalogWithValidationErrorsCount: number;
  customersAndSuppliersWithErrorsCount: number;
  outOfOperatingYearRecordsCount: number;
  cashOperationsMissingAccountOrMethodCount: number;
}

export interface ReconciliationSummaryResult {
  executedAt: string;
  tolerance: number;
  okCount: number;
  reviewCount: number;
  alertCount: number;
  bannerMessage: string;
  controls: ReconciliationControlResult[];
}

export function evaluateAll31ReconciliationControls(
  s: ReconciliationSnapshotInput
): ReconciliationSummaryResult {
  const tol = s.tolerance;

  const cmpControl = (
    code: number,
    area: ControlArea,
    description: string,
    valA: number,
    valB: number,
    recommendedAction: string
  ): ReconciliationControlResult => {
    const diff = excelRound(valA - valB, 2);
    const state: ControlState = Math.abs(diff) <= tol ? 'OK' : 'REVISAR';
    return {
      code,
      area,
      description,
      valueA: valA,
      valueB: valB,
      difference: diff,
      tolerance: tol,
      state,
      recommendedAction,
    };
  };

  const errCountControl = (
    code: number,
    area: ControlArea,
    description: string,
    errorCount: number,
    recommendedAction: string,
    isInformationalAlert: boolean = false
  ): ReconciliationControlResult => {
    const state: ControlState =
      errorCount === 0 ? 'OK' : isInformationalAlert ? 'ALERTA' : 'REVISAR';
    return {
      code,
      area,
      description,
      valueA: errorCount,
      valueB: 0,
      difference: errorCount,
      tolerance: 0,
      state,
      recommendedAction,
    };
  };

  const controls: ReconciliationControlResult[] = [
    // 1..4 Ventas y cobros
    cmpControl(
      1,
      'Ventas y cobros',
      'Ventas con impuesto = ventas de contado + ventas a crédito',
      s.totalSalesWithTax,
      excelRound(s.cashSalesWithTax + s.creditSalesWithTax, 2),
      'Hay líneas de venta sin condición de cobro (Contado/Crédito).'
    ),
    cmpControl(
      2,
      'Ventas y cobros',
      'Cuentas por cobrar: importe original = ventas a crédito',
      s.receivablesOriginalTotal,
      s.creditSalesWithTax,
      'Revise ventas a crédito sin ID o sin fecha.'
    ),
    cmpControl(
      3,
      'Ventas y cobros',
      'Cobros registrados = cobros aplicados a facturas',
      s.registeredCollectionsTotal,
      s.appliedCollectionsToReceivablesTotal,
      'Un cobro apunta a un ID de venta inexistente o que no es a crédito.'
    ),
    errCountControl(
      4,
      'Ventas y cobros',
      'Cobros con errores (exceso, ID inválido, fechas)',
      s.collectionsWithValidationErrorsCount,
      'Vea la columna Control de COBROS en REGISTRO MOVIMIENTOS Y AJUSTES.'
    ),

    // 5..10 Compras y gastos
    cmpControl(
      5,
      'Compras y gastos',
      'Compras: costo para inventario = entradas valoradas en el cálculo de costos',
      s.purchasesCapitalizedCostTotal,
      s.costingSheetValuedEntriesTotal,
      'Compras con código inexistente o fuera del año no se valoran.'
    ),
    errCountControl(
      6,
      'Compras y gastos',
      'Compras con errores (servicios, códigos, datos)',
      s.purchasesWithValidationErrorsCount,
      'Los servicios no son inventario: regístrelos en GASTOS OPERATIVOS.'
    ),
    cmpControl(
      7,
      'Compras y gastos',
      'Cuentas por pagar: original = compras a crédito + gastos a crédito',
      s.payablesOriginalTotal,
      excelRound(s.creditPurchasesWithTaxTotal + s.creditExpensesWithTaxTotal, 2),
      'Revise obligaciones de compra o gasto a crédito con IDs vacíos.'
    ),
    cmpControl(
      8,
      'Compras y gastos',
      'Pagos registrados = pagos aplicados a obligaciones',
      s.registeredPaymentsTotal,
      s.appliedPaymentsToPayablesTotal,
      'Un pago apunta a un ID inexistente o no a crédito.'
    ),
    errCountControl(
      9,
      'Compras y gastos',
      'Pagos con errores (exceso, ID inválido, fechas)',
      s.paymentsWithValidationErrorsCount,
      'Vea la columna Control de PAGOS.'
    ),
    errCountControl(
      10,
      'Compras y gastos',
      'Gastos con errores',
      s.expensesWithValidationErrorsCount,
      'Vea la columna Control de GASTOS OPERATIVOS.'
    ),

    // 11..16 Caja y bancos
    cmpControl(
      11,
      'Caja y bancos',
      'Σ saldos de cuentas = saldos iniciales + entradas − salidas ± ajustes (según registros)',
      s.sumFinancialAccountsCurrentBalance,
      s.expectedGlobalCashBalanceFromRecords,
      'Hay operaciones sin cuenta válida (dinero que no está asignado a ninguna cuenta).'
    ),
    cmpControl(
      12,
      'Caja y bancos',
      'Transferencias entrantes = transferencias registradas',
      s.accountsTransfersInTotal,
      s.registeredTransfersTotal,
      'Una transferencia usa una cuenta no registrada.'
    ),
    cmpControl(
      13,
      'Caja y bancos',
      'Transferencias salientes = transferencias registradas',
      s.accountsTransfersOutTotal,
      s.registeredTransfersTotal,
      'Una transferencia usa una cuenta no registrada.'
    ),
    cmpControl(
      14,
      'Caja y bancos',
      'FLUJO DE CAJA: saldo final = saldo de CAJA Y BANCOS',
      s.cashFlowAnnualClosingBalance,
      s.sumFinancialAccountsCurrentBalance,
      'Operaciones sin cuenta o fuera del año.'
    ),
    errCountControl(
      15,
      'Caja y bancos',
      'Cuentas con saldo negativo',
      s.negativeBalanceAccountsCount,
      'Revise cobros/pagos o registre la transferencia que falta.'
    ),
    errCountControl(
      16,
      'Caja y bancos',
      'Transferencias y correcciones con errores',
      s.transfersAndCashAdjustmentsWithErrorsCount,
      'Vea la columna Control de esas tablas.'
    ),

    // 17..22 Inventario
    cmpControl(
      17,
      'Inventario',
      'Stock: INVENTARIO = cierre del cálculo de costos',
      s.inventorySheetTotalStock,
      s.costingSheetDecemberClosingStock,
      'Registros fuera del año o servicios con stock.'
    ),
    cmpControl(
      18,
      'Inventario',
      'Valor: inicial + compras − costo de ventas ± ajustes = valor final',
      s.inventorySheetTotalValue,
      s.expectedInventoryClosingValueFromFormula,
      'Revise costos manuales y registros con errores.'
    ),
    cmpControl(
      19,
      'Inventario',
      'Costo de ventas (productos) registrado = método de costo promedio',
      s.recordedProductsCostOfSalesInSalesSheet,
      s.averageCostMethodProductsCostOfSales,
      'Hay líneas de venta con costo manual o con código inexistente.'
    ),
    errCountControl(
      20,
      'Inventario',
      'Productos con stock negativo',
      s.negativeStockProductsCount,
      'Se vendió más de lo disponible: falta una compra o un ajuste.'
    ),
    errCountControl(
      21,
      'Inventario',
      'Ajustes de inventario con errores',
      s.inventoryAdjustmentsWithErrorsCount,
      'Los ajustes requieren motivo y solo aplican a productos.'
    ),
    errCountControl(
      22,
      'Inventario',
      'Productos bajo el mínimo o sin stock',
      s.lowOrOutOfStockProductsCount,
      'Informativo: vea INVENTARIO > Reposición sugerida.',
      true // Estado ALERTA en vez de REVISAR
    ),

    // 23..26 Resultados
    cmpControl(
      23,
      'Resultados',
      'ESTADO DE RESULTADOS: ventas netas = ventas del registro',
      s.incomeStatementAnnualNetSales,
      s.salesSheetAnnualNetSales,
      'Ventas fuera del año de operación.'
    ),
    cmpControl(
      24,
      'Resultados',
      'DASHBOARD: ventas anuales = estado de resultados',
      s.dashboardAnnualNetSales,
      s.incomeStatementAnnualNetSales,
      'Revise vínculos del dashboard.'
    ),
    cmpControl(
      25,
      'Resultados',
      'Gastos operativos: Σ categorías = total',
      s.sumIncomeStatementExpenseCategories,
      s.incomeStatementTotalOperatingExpenses,
      'Categoría de gasto sin definir.'
    ),
    cmpControl(
      26,
      'Resultados',
      'Puente utilidad → efectivo cuadra con FLUJO DE CAJA (Σ diferencias mensuales)',
      s.sumAbsMonthlyBridgeDifferences,
      0,
      'Datos con error o costos manuales: la utilidad no se concilia con el efectivo.'
    ),

    // 27..31 Calidad de datos
    errCountControl(
      27,
      'Calidad de datos',
      'Ventas con errores o datos faltantes',
      s.salesWithValidationErrorsCount,
      'Vea la columna Control de REGISTRO DE VENTAS.'
    ),
    errCountControl(
      28,
      'Calidad de datos',
      'Catálogo con errores (duplicados, datos faltantes, precios negativos)',
      s.catalogWithValidationErrorsCount,
      'Vea la columna Control de PRODUCTOS Y SERVICIOS.'
    ),
    errCountControl(
      29,
      'Calidad de datos',
      'Clientes y proveedores con errores o duplicados',
      s.customersAndSuppliersWithErrorsCount,
      'Vea la columna Control en CLIENTES y PROVEEDORES.'
    ),
    errCountControl(
      30,
      'Calidad de datos',
      'Registros fuera del año de operación (excluidos de los reportes)',
      s.outOfOperatingYearRecordsCount,
      'Cambie el año en CONFIGURACIÓN o corrija las fechas.'
    ),
    errCountControl(
      31,
      'Calidad de datos',
      'Ventas de contado sin cuenta o método de pago',
      s.cashOperationsMissingAccountOrMethodCount,
      'Indique la cuenta y el método para que el dinero llegue a CAJA Y BANCOS.'
    ),
  ];

  const okCount = controls.filter((c) => c.state === 'OK').length;
  const reviewCount = controls.filter((c) => c.state === 'REVISAR').length;
  const alertCount = controls.filter((c) => c.state === 'ALERTA').length;

  const bannerMessage =
    reviewCount === 0
      ? '✔ Todos los controles de conciliación están en orden'
      : `⚠ Hay ${reviewCount} control(es) por revisar (hoja CONTROLES)`;

  return {
    executedAt: new Date().toISOString(),
    tolerance: tol,
    okCount,
    reviewCount,
    alertCount,
    bannerMessage,
    controls,
  };
}

