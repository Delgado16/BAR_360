// ============================================================================
// MI NEGOCIO PRO 360 — FASE 6: SERVICIO DE INTELIGENCIA EMPRESARIAL
// Implementa de forma completa las hojas:
// - Hoja 3: DASHBOARD EMPRESARIAL (16 KPIs, 4 cintillos de alerta, 6 gráficos)
// - Hoja 14: FLUJO DE CAJA (12 meses, Facturado vs Cobrado, Proyección 3 meses)
// - Hoja 15: ESTADO DE RESULTADOS (Devengado mensual/anual, categorías, Puente a Efectivo)
// - Hoja 16: REPORTES (14 reportes filtrables y exportables)
// - Hoja 17: SIMULADOR DE PRECIOS (Cálculos en tiempo real sin alterar catálogo)
// - Hoja 19: CONTROLES (Centro de Control y Conciliación de 31 reglas)
// ============================================================================

import {
  type AuthenticatedTenantContext,
  assertTenantAccessAndPermission,
} from '../policies/rbac.policy.ts';
import {
  excelRound,
  simulatePricing,
  type PricingSimulationInput,
  type PricingSimulationResult,
} from '../calculations/financial-engine.ts';
import { type ReconciliationSummaryResult } from '../calculations/reconciliation-controls.ts';
import {
  EnterpriseSaaSEngine,
  type SaleDocumentEntity,
  type PurchaseDocumentEntity,
  type OperatingExpenseEntity,
  type CollectionRecordEntity,
  type PaymentRecordEntity,
  type CashAdjustmentEntity,
  type CustomerEntity,
} from './enterprise-saas.service.ts';
import { InventoryAndCostingService } from './inventory-costing.service.ts';
import { FinanceAndTreasuryService } from './finance-treasury.service.ts';
import { CatalogsAndConfigService, SYSTEM_FIXED_LISTS } from './catalogs-config.service.ts';

export interface MonthlyCashFlowRow {
  month: number;
  monthShort: string;
  openingBalance: number;      // D9:O9
  cashSalesCollected: number;  // D11:O11
  creditCollections: number;   // D12:O12
  totalInflows: number;        // D13:O13
  cashPurchasesPaid: number;   // D15:O15
  cashExpensesPaid: number;    // D16:O16
  creditObligationsPaid: number; // D17:O17
  totalOutflows: number;       // D18:O18
  netCashAdjustments: number;  // D19:O19
  netCashFlow: number;         // D20:O20
  closingBalance: number;      // D21:O21
  billedSalesWithTax: number;  // D24:O24
  billedVsCollectedDiff: number; // D26:O26 = D24 - D13
}

export interface LiquidityProjectionMonth {
  monthNumber: number;
  monthName: string;
  projectedInflows: number;
  projectedOutflows: number;
  projectedNetFlow: number;
  projectedClosingBalance: number;
  alert: 'OK' | '⚠ Liquidez insuficiente';
}

export interface TenantDataSnapshot {
  sales: SaleDocumentEntity[];
  purchases: PurchaseDocumentEntity[];
  expenses: OperatingExpenseEntity[];
  collections: CollectionRecordEntity[];
  payments: PaymentRecordEntity[];
  cashAdjustments: CashAdjustmentEntity[];
  customers: CustomerEntity[];
}

export class BusinessIntelligenceService {
  private readonly engine: EnterpriseSaaSEngine;
  private readonly inventoryService: InventoryAndCostingService;
  private readonly financeService: FinanceAndTreasuryService;
  private readonly catalogService: CatalogsAndConfigService;

  constructor(
    engine: EnterpriseSaaSEngine,
    inventoryService: InventoryAndCostingService,
    financeService: FinanceAndTreasuryService,
    catalogService: CatalogsAndConfigService
  ) {
    this.engine = engine;
    this.inventoryService = inventoryService;
    this.financeService = financeService;
    this.catalogService = catalogService;
  }

  // --------------------------------------------------------------------------
  // 1. Flujo de Caja Mensual, Anual y Proyección de Liquidez (Hoja 14)
  // --------------------------------------------------------------------------
  public getCashFlowReport(
    ctx: AuthenticatedTenantContext,
    snapshot: TenantDataSnapshot,
    projectionParams?: { expectedInflowsGrowthRate?: number; expectedOutflowsChangeRate?: number }
  ): {
    annualSummary: {
      openingBalance: number;
      totalInflows: number;
      totalOutflows: number;
      totalNetAdjustments: number;
      closingBalance: number;
    };
    months: MonthlyCashFlowRow[];
    projection: {
      baseClosingBalance: number;
      months: LiquidityProjectionMonth[];
      upcoming30DaysReceivables: number;
      upcoming30DaysPayables: number;
      overdueReceivables: number;
      overduePayables: number;
    };
  } {
    assertTenantAccessAndPermission(ctx, ctx.tenantId, 'cash_flow', 'VIEW');
    const settings = this.engine.getTenantSettings(ctx, ctx.tenantId);
    const year = settings.operatingYear;

    const cashAccounts = this.financeService.getCashAndBanksSheetView(ctx);
    const initialYearBalance = cashAccounts.accounts.reduce(
      (sum, a) => excelRound(sum + a.openingBalance, 2),
      0
    );

    const months: MonthlyCashFlowRow[] = [];
    let runningBalance = initialYearBalance;

    for (let m = 1; m <= 12; m++) {
      const mSales = snapshot.sales.filter(
        (s) => s.tenantId === ctx.tenantId && s.status === 'CONFIRMED' && s.year === year && s.month === m
      );
      const mPurchases = snapshot.purchases.filter(
        (p) => p.tenantId === ctx.tenantId && p.status === 'CONFIRMED' && p.year === year && p.month === m
      );
      const mExpenses = snapshot.expenses.filter(
        (e) => e.tenantId === ctx.tenantId && e.status === 'CONFIRMED' && e.year === year && e.month === m
      );
      const mCollections = snapshot.collections.filter(
        (c) => c.tenantId === ctx.tenantId && c.year === year && c.month === m
      );
      const mPayments = snapshot.payments.filter(
        (p) => p.tenantId === ctx.tenantId && p.year === year && p.month === m
      );
      const mCashAdj = snapshot.cashAdjustments.filter(
        (ca) => ca.tenantId === ctx.tenantId && ca.year === year && ca.month === m
      );

      const openingBalance = runningBalance;
      const cashSalesCollected = mSales
        .filter((s) => s.paymentCondition === 'CASH')
        .reduce((sum, s) => excelRound(sum + s.grandTotal, 2), 0);
      const creditCollections = mCollections.reduce((sum, c) => excelRound(sum + c.amount, 2), 0);
      const totalInflows = excelRound(cashSalesCollected + creditCollections, 2);

      const cashPurchasesPaid = mPurchases
        .filter((p) => p.paymentCondition === 'CASH')
        .reduce((sum, p) => excelRound(sum + p.grandTotal, 2), 0);
      const cashExpensesPaid = mExpenses
        .filter((e) => e.paymentCondition === 'CASH')
        .reduce((sum, e) => excelRound(sum + e.totalAmount, 2), 0);
      const creditObligationsPaid = mPayments.reduce((sum, p) => excelRound(sum + p.amount, 2), 0);
      const totalOutflows = excelRound(cashPurchasesPaid + cashExpensesPaid + creditObligationsPaid, 2);

      const netCashAdjustments = mCashAdj.reduce(
        (sum, ca) => excelRound(sum + (ca.direction === 'INFLOW' ? ca.amount : -ca.amount), 2),
        0
      );

      const netCashFlow = excelRound(totalInflows - totalOutflows + netCashAdjustments, 2);
      const closingBalance = excelRound(openingBalance + netCashFlow, 2);

      const billedSalesWithTax = mSales.reduce((sum, s) => excelRound(sum + s.grandTotal, 2), 0);
      const billedVsCollectedDiff = excelRound(billedSalesWithTax - totalInflows, 2);

      months.push({
        month: m,
        monthShort: SYSTEM_FIXED_LISTS.months[m - 1]?.shortName ?? String(m),
        openingBalance,
        cashSalesCollected,
        creditCollections,
        totalInflows,
        cashPurchasesPaid,
        cashExpensesPaid,
        creditObligationsPaid,
        totalOutflows,
        netCashAdjustments,
        netCashFlow,
        closingBalance,
        billedSalesWithTax,
        billedVsCollectedDiff,
      });

      runningBalance = closingBalance;
    }

    // Proyección simple de liquidez a 3 meses (FLUJO DE CAJA!filas 30..43)
    const analysisM = settings.analysisMonth;
    const startIdx = Math.max(0, analysisM - 3);
    const slice = months.slice(startIdx, analysisM);
    const avgInflows =
      slice.length > 0 ? slice.reduce((s, r) => s + r.totalInflows, 0) / slice.length : 0;
    const avgOutflows =
      slice.length > 0 ? slice.reduce((s, r) => s + r.totalOutflows, 0) / slice.length : 0;

    const gIn = projectionParams?.expectedInflowsGrowthRate ?? 0;
    const gOut = projectionParams?.expectedOutflowsChangeRate ?? 0;

    const baseClosingBalance = months[analysisM - 1]?.closingBalance ?? initialYearBalance;
    let projBalance = baseClosingBalance;
    let prevIn = avgInflows;
    let prevOut = avgOutflows;
    const projectionMonths: LiquidityProjectionMonth[] = [];

    for (let step = 0; step < 3; step++) {
      const nextMonthIdx = (analysisM + step) % 12; // 0..11
      const mInfo = SYSTEM_FIXED_LISTS.months[nextMonthIdx]!;
      const projectedInflows = excelRound(prevIn * (1 + gIn), 2);
      const projectedOutflows = excelRound(prevOut * (1 + gOut), 2);
      const projectedNetFlow = excelRound(projectedInflows - projectedOutflows, 2);
      projBalance = excelRound(projBalance + projectedNetFlow, 2);

      projectionMonths.push({
        monthNumber: mInfo.number,
        monthName: mInfo.fullName,
        projectedInflows,
        projectedOutflows,
        projectedNetFlow,
        projectedClosingBalance: projBalance,
        alert: projBalance < 0 ? '⚠ Liquidez insuficiente' : 'OK',
      });

      prevIn = projectedInflows;
      prevOut = projectedOutflows;
    }

    const cxc = this.financeService.getReceivablesSheetView(ctx);
    const cxp = this.financeService.getPayablesSheetView(ctx);
    const cutoffMs = Date.parse(settings.cutoffDate + 'T00:00:00Z');
    const thirtyDaysMs = cutoffMs + 30 * 86_400_000;

    const upcoming30DaysReceivables = cxc.rows
      .filter((r) => {
        const d = Date.parse(r.dueDate + 'T00:00:00Z');
        return r.balanceAmount > settings.reconciliationTolerance && d >= cutoffMs && d <= thirtyDaysMs;
      })
      .reduce((s, r) => excelRound(s + r.balanceAmount, 2), 0);

    const upcoming30DaysPayables = cxp.rows
      .filter((r) => {
        const d = Date.parse(r.dueDate + 'T00:00:00Z');
        return r.balanceAmount > settings.reconciliationTolerance && d >= cutoffMs && d <= thirtyDaysMs;
      })
      .reduce((s, r) => excelRound(s + r.balanceAmount, 2), 0);

    return {
      annualSummary: {
        openingBalance: initialYearBalance,
        totalInflows: months.reduce((s, m) => excelRound(s + m.totalInflows, 2), 0),
        totalOutflows: months.reduce((s, m) => excelRound(s + m.totalOutflows, 2), 0),
        totalNetAdjustments: months.reduce((s, m) => excelRound(s + m.netCashAdjustments, 2), 0),
        closingBalance: runningBalance,
      },
      months,
      projection: {
        baseClosingBalance,
        months: projectionMonths,
        upcoming30DaysReceivables,
        upcoming30DaysPayables,
        overdueReceivables: cxc.kpis.overdueTotal,
        overduePayables: cxp.kpis.overdueTotal,
      },
    };
  }

  // --------------------------------------------------------------------------
  // 2. Dashboard Empresarial Completo (Hoja 3: 16 KPIs + Alertas + Gráficos)
  // --------------------------------------------------------------------------
  public getDashboardData(ctx: AuthenticatedTenantContext, snapshot: TenantDataSnapshot) {
    assertTenantAccessAndPermission(ctx, ctx.tenantId, 'dashboard', 'VIEW');
    const settings = this.engine.getTenantSettings(ctx, ctx.tenantId);
    const year = settings.operatingYear;
    const mIdx = settings.analysisMonth - 1;

    const incomeStmt = this.engine.getAnnualIncomeStatementAndBridge(ctx);
    const monthIS = incomeStmt.months[mIdx]!;
    const invView = this.inventoryService.getInventorySheetView(ctx);
    const cxcView = this.financeService.getReceivablesSheetView(ctx);
    const cxpView = this.financeService.getPayablesSheetView(ctx);
    const cashView = this.financeService.getCashAndBanksSheetView(ctx);
    const reconView = this.engine.executeReconciliationCenter(ctx);

    const confirmedSalesYear = snapshot.sales.filter(
      (s) => s.tenantId === ctx.tenantId && s.status === 'CONFIRMED' && s.year === year
    );
    const selectedDayNetSales = confirmedSalesYear
      .filter((s) => s.date === settings.selectedDashboardDate)
      .reduce((sum, s) => excelRound(sum + s.netSubtotal, 2), 0);

    const monthSalesCount = confirmedSalesYear.filter((s) => s.month === settings.analysisMonth).length;
    const annualSalesCount = confirmedSalesYear.length;
    const monthAverageTicket = monthSalesCount > 0 ? excelRound(monthIS.netSales / monthSalesCount, 2) : 0;

    const reports = this.getEnterpriseReports(ctx, snapshot);

    return {
      header: {
        tradeName: settings.tradeName,
        currencyCode: settings.currencyCode,
        currencySymbol: settings.currencySymbol,
        operatingYear: year,
        analysisMonth: settings.analysisMonth,
        analysisMonthName: SYSTEM_FIXED_LISTS.months[mIdx]?.fullName ?? '',
        selectedDashboardDate: settings.selectedDashboardDate,
        cutoffDate: settings.cutoffDate,
      },
      alerts: {
        lowStockCount: invView.kpis.lowOrOutOfStockCount,
        overdueReceivablesCount: cxcView.kpis.overdueInvoicesCount,
        overduePayablesCount: cxpView.kpis.overdueObligationsCount,
        reconciliationReviewCount: reconView.reviewCount,
        reconciliationBanner: reconView.bannerMessage,
      },
      kpis: {
        // 16 Indicadores oficiales de la Sección 7 y Hoja 3
        selectedDayNetSales,
        monthNetSales: monthIS.netSales,
        annualNetSales: incomeStmt.annualNetSales,
        monthCogs: excelRound(monthIS.costOfSalesTotal, 2),
        monthGrossProfit: monthIS.grossProfit,
        annualGrossProfit: incomeStmt.annualGrossProfit,
        monthOperatingExpenses: monthIS.operatingExpensesTotal,
        monthOperatingProfit: monthIS.estimatedOperatingProfit,
        monthNetInventoryAdjustments: excelRound(monthIS.netInventoryAdjustments, 2),
        monthGrossMargin: monthIS.grossMargin,
        annualGrossMargin:
          incomeStmt.annualNetSales > 0 ? incomeStmt.annualGrossProfit / incomeStmt.annualNetSales : 0,
        monthOperatingMargin: monthIS.operatingMargin,
        annualOperatingMargin:
          incomeStmt.annualNetSales > 0
            ? incomeStmt.annualOperatingProfit / incomeStmt.annualNetSales
            : 0,
        monthSalesCount,
        annualSalesCount,
        monthAverageTicket,
        receivablesTotal: cxcView.kpis.totalReceivable,
        overdueReceivablesTotal: cxcView.kpis.overdueTotal,
        payablesTotal: cxpView.kpis.totalPayable,
        overduePayablesTotal: cxpView.kpis.overdueTotal,
        inventoryTotalValue: invView.kpis.totalInventoryValue,
        totalUnitsInStock: invView.rows.reduce((s, r) => s + r.currentStock, 0),
        lowStockProductsCount: invView.kpis.lowOrOutOfStockCount,
        suggestedReplenishmentUnits: invView.kpis.totalSuggestedReplenishment,
        cashAndBanksTotalBalance: cashView.kpis.totalBalance,
        cashInHandBalance: cashView.kpis.cashBalance,
      },
      charts: {
        monthlySeries: incomeStmt.months.map((m, idx) => ({
          month: SYSTEM_FIXED_LISTS.months[idx]?.shortName ?? String(idx + 1),
          netSales: m.netSales,
          costsAndExpenses: excelRound(m.costOfSalesTotal + m.operatingExpensesTotal, 2),
          operatingProfit: m.estimatedOperatingProfit,
        })),
        top10Products: reports.topProducts,
        salesByCategory: reports.salesByCategory,
        collectionsByPaymentMethod: reports.collectionsByPaymentMethod,
      },
    };
  }

  // --------------------------------------------------------------------------
  // 3. Reportes Empresariales (Hoja 16 + Sección 17)
  // --------------------------------------------------------------------------
  public getEnterpriseReports(ctx: AuthenticatedTenantContext, snapshot: TenantDataSnapshot) {
    assertTenantAccessAndPermission(ctx, ctx.tenantId, 'reports', 'VIEW');
    const settings = this.engine.getTenantSettings(ctx, ctx.tenantId);
    const year = settings.operatingYear;
    const month = settings.analysisMonth;

    const confirmedSalesYear = snapshot.sales.filter(
      (s) => s.tenantId === ctx.tenantId && s.status === 'CONFIRMED' && s.year === year
    );
    const confirmedExpensesYear = snapshot.expenses.filter(
      (e) => e.tenantId === ctx.tenantId && e.status === 'CONFIRMED' && e.year === year
    );
    const collectionsYear = snapshot.collections.filter(
      (c) => c.tenantId === ctx.tenantId && c.year === year
    );

    // 1. Ventas diarias del mes de análisis
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const dailySales = Array.from({ length: daysInMonth }, (_, i) => {
      const day = i + 1;
      const isoDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const daySales = confirmedSalesYear.filter((s) => s.date === isoDate);
      const dayCashCollections = collectionsYear
        .filter((c) => c.date === isoDate)
        .reduce((sum, c) => excelRound(sum + c.amount, 2), 0);
      const cashSalesToday = daySales
        .filter((s) => s.paymentCondition === 'CASH')
        .reduce((sum, s) => excelRound(sum + s.grandTotal, 2), 0);

      const netSales = daySales.reduce((sum, s) => excelRound(sum + s.netSubtotal, 2), 0);
      const cogs = daySales.reduce((sum, s) => excelRound(sum + s.costTotal, 2), 0);

      return {
        day,
        date: isoDate,
        salesCount: daySales.length,
        netSales,
        costOfSales: cogs,
        grossProfit: excelRound(netSales - cogs, 2),
        realCashCollected: excelRound(cashSalesToday + dayCashCollections, 2),
      };
    });

    // 2. Ventas mensuales del año + 11. Evolución mensual
    const incomeStmt = this.engine.getAnnualIncomeStatementAndBridge(ctx);
    const monthlySales = incomeStmt.months.map((m, idx) => {
      const mNum = idx + 1;
      const count = confirmedSalesYear.filter((s) => s.month === mNum).length;
      return {
        month: mNum,
        monthName: SYSTEM_FIXED_LISTS.months[idx]?.fullName ?? String(mNum),
        netSales: m.netSales,
        salesCount: count,
        averageTicket: count > 0 ? excelRound(m.netSales / count, 2) : 0,
        costOfSales: excelRound(m.costOfSalesTotal, 2),
        grossProfit: m.grossProfit,
        grossMargin: m.grossMargin,
        operatingProfit: m.estimatedOperatingProfit,
        operatingMargin: m.operatingMargin,
      };
    });

    // 3, 4 y 5. Agregación por producto (Más vendidos, Menos vendidos, Rentabilidad)
    const products = this.engine.listProducts(ctx, ctx.tenantId);
    const productStats = products.map((p) => {
      let units = 0;
      let netRevenue = 0;
      let cost = 0;
      for (const s of confirmedSalesYear) {
        for (const l of s.lines) {
          if (l.productId === p.id) {
            units += l.quantity;
            netRevenue = excelRound(netRevenue + l.netSubtotal, 2);
            cost = excelRound(cost + l.costTotal, 2);
          }
        }
      }
      const grossProfit = excelRound(netRevenue - cost, 2);
      return {
        productId: p.id,
        sku: p.sku,
        name: p.name,
        isActive: p.status === 'ACTIVE',
        units,
        netRevenue,
        cost,
        grossProfit,
        grossMargin: netRevenue > 0 ? grossProfit / netRevenue : 0,
      };
    });

    const sortCriterion = settings.rankingCriterion;
    const topProducts = [...productStats]
      .filter((p) => p.units > 0 || p.netRevenue > 0)
      .sort((a, b) =>
        sortCriterion === 'UNITS' ? b.units - a.units : b.netRevenue - a.netRevenue
      )
      .slice(0, 10);

    const bottomProducts = [...productStats]
      .filter((p) => p.isActive)
      .sort((a, b) =>
        sortCriterion === 'UNITS' ? a.units - b.units : a.netRevenue - b.netRevenue
      )
      .slice(0, 10);

    const productProfitability = [...productStats]
      .filter((p) => p.netRevenue > 0)
      .sort((a, b) => b.grossProfit - a.grossProfit)
      .slice(0, 30);

    // 6. Gastos por categoría
    const expensesByCatMap = new Map<string, { annual: number; analysisMonth: number }>();
    for (const e of confirmedExpensesYear) {
      const curr = expensesByCatMap.get(e.categoryName) ?? { annual: 0, analysisMonth: 0 };
      curr.annual = excelRound(curr.annual + e.incomeStatementAmount, 2);
      if (e.month === month) {
        curr.analysisMonth = excelRound(curr.analysisMonth + e.incomeStatementAmount, 2);
      }
      expensesByCatMap.set(e.categoryName, curr);
    }
    const expensesByCategory = Array.from(expensesByCatMap.entries())
      .map(([categoryName, vals]) => ({
        categoryName,
        annualAmount: vals.annual,
        analysisMonthAmount: vals.analysisMonth,
        shareOfTotal:
          incomeStmt.annualOperatingExpenses > 0
            ? vals.annual / incomeStmt.annualOperatingExpenses
            : 0,
      }))
      .sort((a, b) => b.annualAmount - a.annualAmount);

    // 7. Clientes principales (excluye Genérico mostrador)
    const custView = this.catalogService.getCustomersDirectoryView(
      ctx,
      snapshot.customers,
      confirmedSalesYear,
      collectionsYear
    );

    // 8. Inventario crítico
    const invView = this.inventoryService.getInventorySheetView(ctx);

    // 9. Cobros por método de pago (Contado + Cobros de CxC)
    const byMethodMap = new Map<string, number>();
    for (const s of confirmedSalesYear) {
      if (s.paymentCondition === 'CASH' && s.paymentMethodName) {
        byMethodMap.set(
          s.paymentMethodName,
          excelRound((byMethodMap.get(s.paymentMethodName) ?? 0) + s.grandTotal, 2)
        );
      }
    }
    for (const c of collectionsYear) {
      byMethodMap.set(
        c.paymentMethodName,
        excelRound((byMethodMap.get(c.paymentMethodName) ?? 0) + c.amount, 2)
      );
    }
    const collectionsByPaymentMethod = Array.from(byMethodMap.entries())
      .map(([methodName, collectedTotal]) => ({ methodName, collectedTotal }))
      .sort((a, b) => b.collectedTotal - a.collectedTotal);

    // 10. Ventas por categoría
    const byCatMap = new Map<string, number>();
    for (const s of confirmedSalesYear) {
      for (const l of s.lines) {
        byCatMap.set(
          l.categoryName,
          excelRound((byCatMap.get(l.categoryName) ?? 0) + l.netSubtotal, 2)
        );
      }
    }
    const salesByCategory = Array.from(byCatMap.entries())
      .map(([categoryName, netSales]) => ({ categoryName, netSales }))
      .sort((a, b) => b.netSales - a.netSales);

    // 11. Cuentas vencidas (CxC y CxP)
    const cxcView = this.financeService.getReceivablesSheetView(ctx);
    const cxpView = this.financeService.getPayablesSheetView(ctx);

    return {
      dailySales,
      monthlySales,
      topProducts,
      bottomProducts,
      productProfitability,
      expensesByCategory,
      topCustomers: custView.topRankedRegisteredCustomers.slice(0, 10),
      criticalInventory: invView.criticalInventoryRows,
      overdueReceivables: cxcView.rows.filter((r) => r.status === 'OVERDUE'),
      overduePayables: cxpView.rows.filter((r) => r.status === 'OVERDUE'),
      collectionsByPaymentMethod,
      salesByCategory,
    };
  }

  // --------------------------------------------------------------------------
  // 4. Simulador de Precios Interactivo (Hoja 17)
  // --------------------------------------------------------------------------
  public simulateProductPricing(
    ctx: AuthenticatedTenantContext,
    input: PricingSimulationInput
  ): PricingSimulationResult {
    assertTenantAccessAndPermission(ctx, ctx.tenantId, 'pricing_simulator', 'VIEW');
    return simulatePricing(input);
  }

  // --------------------------------------------------------------------------
  // 5. Centro de Control y Conciliación (Hoja 19: 31 Controles)
  // --------------------------------------------------------------------------
  public getReconciliationCenterReport(ctx: AuthenticatedTenantContext): ReconciliationSummaryResult {
    return this.engine.executeReconciliationCenter(ctx);
  }
}
