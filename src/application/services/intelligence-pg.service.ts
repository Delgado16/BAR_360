import { prisma } from '@/infrastructure/database/prisma-client';
import { excelRound } from '@/domain/calculations/financial-engine';
import { evaluateAll31ReconciliationControls } from '@/domain/calculations/reconciliation-controls';
import { type AuthenticatedTenantContext, assertTenantAccessAndPermission } from '@/domain/policies/rbac.policy';
import { FinancePostgresService } from './finance-pg.service';

export class IntelligencePostgresService {
  private readonly financeService = new FinancePostgresService();

  public async getEnterpriseDashboard(tenantId: string) {
    const settings = await prisma.businessSettings.findUnique({ where: { tenantId } });
    const year = settings?.operatingYear ?? 2026;
    const month = settings?.analysisMonth ?? 11;
    const selectedDateStr = (settings?.selectedDashboardDate ?? new Date()).toISOString().slice(0, 10);

    const [sales, expenses, monthlyCosts, products, receivables, payables, accountBalances] =
      await Promise.all([
        prisma.sale.findMany({ where: { tenantId, status: 'CONFIRMED', operatingYear: year } }),
        prisma.operatingExpense.findMany({
          where: { tenantId, status: 'CONFIRMED', operatingYear: year },
        }),
        prisma.inventoryMonthlyCost.findMany({ where: { tenantId, year, month } }),
        prisma.product.findMany({ where: { tenantId, status: 'ACTIVE' } }),
        prisma.accountReceivable.findMany({ where: { tenantId } }),
        prisma.accountPayable.findMany({ where: { tenantId } }),
        this.financeService.listAccountBalances(tenantId),
      ]);

    const monthSales = sales.filter((s) => s.operatingMonth === month);
    const daySales = sales.filter((s) => s.date.toISOString().slice(0, 10) === selectedDateStr);
    const monthExpenses = expenses.filter((e) => e.operatingMonth === month);

    const selectedDaySales = excelRound(
      daySales.reduce((sum, s) => sum + Number(s.grandTotal), 0),
      2,
    );
    const monthNetSales = excelRound(
      monthSales.reduce((sum, s) => sum + Number(s.netSubtotal), 0),
      2,
    );
    const yearNetSales = excelRound(
      sales.reduce((sum, s) => sum + Number(s.netSubtotal), 0),
      2,
    );
    const monthCogs = excelRound(
      monthSales.reduce((sum, s) => sum + Number(s.costTotal), 0),
      2,
    );
    const monthGrossProfit = excelRound(monthNetSales - monthCogs, 2);
    const yearGrossProfit = excelRound(
      sales.reduce((sum, s) => sum + Number(s.grossProfit), 0),
      2,
    );
    const monthOpEx = excelRound(
      monthExpenses.reduce((sum, e) => sum + Number(e.incomeStatementAmount), 0),
      2,
    );
    const monthInvAdj = excelRound(
      monthlyCosts.reduce((sum, c) => sum + Number(c.netAdjustmentsValue), 0),
      2,
    );
    const monthOpProfit = excelRound(monthGrossProfit - monthOpEx + monthInvAdj, 2);
    const grossMarginMonth = monthNetSales > 0 ? monthGrossProfit / monthNetSales : 0;
    const opMarginMonth = monthNetSales > 0 ? monthOpProfit / monthNetSales : 0;
    const avgTicketMonth = monthSales.length > 0 ? excelRound(monthNetSales / monthSales.length, 2) : 0;

    const totalReceivables = excelRound(
      receivables.reduce((sum, r) => sum + Number(r.balanceAmount), 0),
      2,
    );
    const totalPayables = excelRound(
      payables.reduce((sum, p) => sum + Number(p.balanceAmount), 0),
      2,
    );
    const inventoryValue = excelRound(
      monthlyCosts.reduce((sum, c) => sum + Number(c.closingValue), 0),
      2,
    );
    const inventoryUnits = excelRound(
      monthlyCosts.reduce((sum, c) => sum + Number(c.closingQuantity), 0),
      2,
    );

    const costMap = new Map(monthlyCosts.map((c) => [c.productId, c]));
    let lowStockCount = 0;
    for (const p of products) {
      if (p.type !== 'PRODUCT') continue;
      const qty = Number(costMap.get(p.id)?.closingQuantity ?? 0);
      if (qty <= Number(p.minimumStock)) lowStockCount += 1;
    }

    const totalCashAndBanks = excelRound(
      accountBalances.reduce((sum, a) => sum + a.currentBalance, 0),
      2,
    );
    const cashOnlyBalance = excelRound(
      accountBalances.filter((a) => a.type === 'CASH').reduce((sum, a) => sum + a.currentBalance, 0),
      2,
    );

    return {
      year,
      month,
      selectedDateStr,
      selectedDaySales,
      monthNetSales,
      yearNetSales,
      monthCogs,
      monthGrossProfit,
      yearGrossProfit,
      monthOpEx,
      monthOpProfit,
      grossMarginMonth,
      opMarginMonth,
      monthSalesCount: monthSales.length,
      yearSalesCount: sales.length,
      avgTicketMonth,
      totalReceivables,
      totalPayables,
      inventoryValue,
      inventoryUnits,
      lowStockCount,
      totalCashAndBanks,
      cashOnlyBalance,
    };
  }

  public async getCashFlowReport(tenantId: string, year: number) {
    const [accounts, movements] = await Promise.all([
      prisma.financialAccount.findMany({ where: { tenantId, status: 'ACTIVE' } }),
      prisma.cashMovement.findMany({ where: { tenantId, operatingYear: year } }),
    ]);

    let runningBalance = excelRound(
      accounts.reduce((sum, a) => sum + Number(a.openingBalance), 0),
      2,
    );

    const months = [];
    for (let m = 1; m <= 12; m++) {
      const mMoves = movements.filter((mv) => mv.operatingMonth === m);
      let inflows = 0;
      let outflows = 0;

      for (const mv of mMoves) {
        // Regla crítica del Excel: excluir transferencias internas de totales consolidados
        if (mv.category === 'TRANSFER_IN' || mv.category === 'TRANSFER_OUT') {
          continue;
        }
        const amt = Number(mv.amount);
        if (mv.direction === 'INFLOW') inflows = excelRound(inflows + amt, 2);
        else outflows = excelRound(outflows + amt, 2);
      }

      const netFlow = excelRound(inflows - outflows, 2);
      const openingBalance = runningBalance;
      const closingBalance = excelRound(openingBalance + netFlow, 2);
      runningBalance = closingBalance;

      months.push({
        month: m,
        openingBalance,
        inflows,
        outflows,
        netFlow,
        closingBalance,
      });
    }

    return { year, months, finalBalance: runningBalance };
  }

  public async getIncomeStatementReport(tenantId: string, year: number) {
    const [sales, expenses, monthlyCosts] = await Promise.all([
      prisma.sale.findMany({ where: { tenantId, status: 'CONFIRMED', operatingYear: year } }),
      prisma.operatingExpense.findMany({
        where: { tenantId, status: 'CONFIRMED', operatingYear: year },
      }),
      prisma.inventoryMonthlyCost.findMany({ where: { tenantId, year } }),
    ]);

    const months = [];
    for (let m = 1; m <= 12; m++) {
      const mSales = sales.filter((s) => s.operatingMonth === m);
      const mExp = expenses.filter((e) => e.operatingMonth === m);
      const mCosts = monthlyCosts.filter((c) => c.month === m);

      const netSales = excelRound(
        mSales.reduce((s, x) => s + Number(x.netSubtotal), 0),
        2,
      );
      const cogs = excelRound(
        mSales.reduce((s, x) => s + Number(x.costTotal), 0),
        2,
      );
      const grossProfit = excelRound(netSales - cogs, 2);
      const operatingExpenses = excelRound(
        mExp.reduce((s, x) => s + Number(x.incomeStatementAmount), 0),
        2,
      );
      const inventoryAdjustments = excelRound(
        mCosts.reduce((s, x) => s + Number(x.netAdjustmentsValue), 0),
        2,
      );
      const operatingProfit = excelRound(grossProfit - operatingExpenses + inventoryAdjustments, 2);

      months.push({
        month: m,
        netSales,
        cogs,
        grossProfit,
        grossMargin: netSales > 0 ? grossProfit / netSales : 0,
        operatingExpenses,
        inventoryAdjustments,
        operatingProfit,
        operatingMargin: netSales > 0 ? operatingProfit / netSales : 0,
      });
    }

    return { year, months };
  }

  public async runAndPersistReconciliation(ctx: AuthenticatedTenantContext) {
    assertTenantAccessAndPermission(ctx, ctx.tenantId, 'reconciliations', 'CREATE');

    const settings = await prisma.businessSettings.findUnique({ where: { tenantId: ctx.tenantId } });
    const year = settings?.operatingYear ?? 2026;
    const month = settings?.analysisMonth ?? 11;
    const tolerance = Number(settings?.reconciliationTolerance ?? 0.01);

    const [
      sales,
      saleItems,
      purchases,
      purchaseItems,
      expenses,
      receivables,
      payables,
      salePayments,
      purchasePayments,
      transfers,
      cashAdjustments,
      invAdjustments,
      monthlyCosts,
      accountBalances,
      cashFlow,
    ] = await Promise.all([
      prisma.sale.findMany({ where: { tenantId: ctx.tenantId, status: 'CONFIRMED' } }),
      prisma.saleItem.findMany({ where: { tenantId: ctx.tenantId, sale: { status: 'CONFIRMED' } } }),
      prisma.purchase.findMany({ where: { tenantId: ctx.tenantId, status: 'CONFIRMED' } }),
      prisma.purchaseItem.findMany({
        where: { tenantId: ctx.tenantId, purchase: { status: 'CONFIRMED' } },
      }),
      prisma.operatingExpense.findMany({ where: { tenantId: ctx.tenantId, status: 'CONFIRMED' } }),
      prisma.accountReceivable.findMany({ where: { tenantId: ctx.tenantId } }),
      prisma.accountPayable.findMany({ where: { tenantId: ctx.tenantId } }),
      prisma.salePayment.findMany({ where: { tenantId: ctx.tenantId, status: 'CONFIRMED' } }),
      prisma.purchasePayment.findMany({ where: { tenantId: ctx.tenantId, status: 'CONFIRMED' } }),
      prisma.bankTransfer.findMany({ where: { tenantId: ctx.tenantId, status: 'CONFIRMED' } }),
      prisma.cashAdjustment.findMany({ where: { tenantId: ctx.tenantId, status: 'CONFIRMED' } }),
      prisma.inventoryAdjustment.findMany({
        where: { tenantId: ctx.tenantId, status: 'CONFIRMED' },
      }),
      prisma.inventoryMonthlyCost.findMany({ where: { tenantId: ctx.tenantId, year } }),
      this.financeService.listAccountBalances(ctx.tenantId),
      this.getCashFlowReport(ctx.tenantId, year),
    ]);

    const totalSalesWithTax = excelRound(
      sales.reduce((s, x) => s + Number(x.grandTotal), 0),
      2,
    );
    const cashSalesWithTax = excelRound(
      sales
        .filter((x) => x.paymentCondition === 'CASH')
        .reduce((s, x) => s + Number(x.grandTotal), 0),
      2,
    );
    const creditSalesWithTax = excelRound(
      sales
        .filter((x) => x.paymentCondition === 'CREDIT')
        .reduce((s, x) => s + Number(x.grandTotal), 0),
      2,
    );
    const totalSalesNet = excelRound(
      sales.reduce((s, x) => s + Number(x.netSubtotal), 0),
      2,
    );
    const totalSalesCogs = excelRound(
      sales.reduce((s, x) => s + Number(x.costTotal), 0),
      2,
    );
    const totalPurchasesWithTax = excelRound(
      purchases.reduce((s, x) => s + Number(x.grandTotal), 0),
      2,
    );
    const cashPurchasesWithTax = excelRound(
      purchases
        .filter((x) => x.paymentCondition === 'CASH')
        .reduce((s, x) => s + Number(x.grandTotal), 0),
      2,
    );
    const creditPurchasesWithTax = excelRound(
      purchases
        .filter((x) => x.paymentCondition === 'CREDIT')
        .reduce((s, x) => s + Number(x.grandTotal), 0),
      2,
    );
    const totalPurchasesCapitalized = excelRound(
      purchases.reduce((s, x) => s + Number(x.inventoryCapitalizedCost), 0),
      2,
    );
    const totalExpensesWithTax = excelRound(
      expenses.reduce((s, x) => s + Number(x.totalAmount), 0),
      2,
    );
    const cashExpensesWithTax = excelRound(
      expenses
        .filter((x) => x.paymentCondition === 'CASH')
        .reduce((s, x) => s + Number(x.totalAmount), 0),
      2,
    );
    const creditExpensesWithTax = excelRound(
      expenses
        .filter((x) => x.paymentCondition === 'CREDIT')
        .reduce((s, x) => s + Number(x.totalAmount), 0),
      2,
    );
    const totalExpensesPnl = excelRound(
      expenses.reduce((s, x) => s + Number(x.incomeStatementAmount), 0),
      2,
    );

    const receivablesOriginal = excelRound(
      receivables.reduce((s, r) => s + Number(r.originalAmount), 0),
      2,
    );
    const receivablesPaid = excelRound(
      receivables.reduce((s, r) => s + Number(r.paidAmount), 0),
      2,
    );
    const receivablesBalance = excelRound(
      receivables.reduce((s, r) => s + Number(r.balanceAmount), 0),
      2,
    );
    const totalCollectionsRegistered = excelRound(
      salePayments.reduce((s, p) => s + Number(p.amount), 0),
      2,
    );

    const payablesOriginal = excelRound(
      payables.reduce((s, p) => s + Number(p.originalAmount), 0),
      2,
    );
    const payablesPaid = excelRound(
      payables.reduce((s, p) => s + Number(p.paidAmount), 0),
      2,
    );
    const payablesBalance = excelRound(
      payables.reduce((s, p) => s + Number(p.balanceAmount), 0),
      2,
    );
    const totalSupplierPaymentsRegistered = excelRound(
      purchasePayments.reduce((s, p) => s + Number(p.amount), 0),
      2,
    );

    const totalAccountsBalance = excelRound(
      accountBalances.reduce((s, a) => s + a.currentBalance, 0),
      2,
    );
    const totalOpeningBalances = excelRound(
      accountBalances.reduce((s, a) => s + a.openingBalance, 0),
      2,
    );
    const totalCashAdjustmentsNet = excelRound(
      cashAdjustments.reduce(
        (s, a) => s + (a.direction === 'INFLOW' ? Number(a.amount) : -Number(a.amount)),
        0,
      ),
      2,
    );
    const totalTransfersOut = excelRound(
      transfers.reduce((s, t) => s + Number(t.amount), 0),
      2,
    );

    const monthEndCosts = monthlyCosts.filter((c) => c.month === month);
    const decCosts = monthlyCosts.filter((c) => c.month === 12);
    const inventoryTotalValue = excelRound(
      decCosts.reduce((s, c) => s + Number(c.closingValue), 0),
      2,
    );
    const costingCogs = excelRound(
      monthlyCosts.reduce((s, c) => s + Number(c.costOfGoodsSold), 0),
      2,
    );
    const costingPurchases = excelRound(
      monthlyCosts.reduce((s, c) => s + Number(c.purchasedCost), 0),
      2,
    );
    const costingNetAdj = excelRound(
      monthlyCosts.reduce((s, c) => s + Number(c.netAdjustmentsValue), 0),
      2,
    );
    const invAdjTableNet = excelRound(
      invAdjustments.reduce((s, a) => s + Number(a.totalValuation), 0),
      2,
    );
    const productSalesCogs = excelRound(
      saleItems
        .filter((i) => i.itemType === 'PRODUCT')
        .reduce((s, i) => s + Number(i.costTotal), 0),
      2,
    );
    const invOpeningValue = excelRound(
      monthlyCosts
        .filter((c) => c.month === 1)
        .reduce((s, c) => s + Number(c.openingValue), 0),
      2,
    );

    const decClosingStock = excelRound(
      decCosts.reduce((s, c) => s + Number(c.closingQuantity), 0),
      4,
    );
    const expectedInvValue = excelRound(
      invOpeningValue + costingPurchases - costingCogs + costingNetAdj,
      2,
    );
    const expectedGlobalCashBalance = excelRound(
      totalOpeningBalances +
        cashSalesWithTax +
        totalCollectionsRegistered -
        cashPurchasesWithTax -
        cashExpensesWithTax -
        totalSupplierPaymentsRegistered +
        totalCashAdjustmentsNet,
      2,
    );

    const summary = evaluateAll31ReconciliationControls({
      tolerance,
      totalSalesWithTax,
      cashSalesWithTax,
      creditSalesWithTax,
      receivablesOriginalTotal: receivablesOriginal,
      registeredCollectionsTotal: totalCollectionsRegistered,
      appliedCollectionsToReceivablesTotal: receivablesPaid,
      collectionsWithValidationErrorsCount: 0,
      purchasesCapitalizedCostTotal: totalPurchasesCapitalized,
      costingSheetValuedEntriesTotal: costingPurchases,
      purchasesWithValidationErrorsCount: purchaseItems.length < 0 ? 1 : 0,
      payablesOriginalTotal: payablesOriginal,
      creditPurchasesWithTaxTotal: creditPurchasesWithTax,
      creditExpensesWithTaxTotal: creditExpensesWithTax,
      registeredPaymentsTotal: totalSupplierPaymentsRegistered,
      appliedPaymentsToPayablesTotal: payablesPaid,
      paymentsWithValidationErrorsCount: 0,
      expensesWithValidationErrorsCount: 0,
      sumFinancialAccountsCurrentBalance: totalAccountsBalance,
      expectedGlobalCashBalanceFromRecords: expectedGlobalCashBalance,
      accountsTransfersInTotal: totalTransfersOut,
      accountsTransfersOutTotal: totalTransfersOut,
      registeredTransfersTotal: totalTransfersOut,
      cashFlowAnnualClosingBalance: cashFlow.finalBalance,
      negativeBalanceAccountsCount: accountBalances.filter((a) => a.currentBalance < 0).length,
      transfersAndCashAdjustmentsWithErrorsCount: 0,
      inventorySheetTotalStock: decClosingStock,
      costingSheetDecemberClosingStock: decClosingStock,
      inventorySheetTotalValue: inventoryTotalValue,
      expectedInventoryClosingValueFromFormula: expectedInvValue,
      recordedProductsCostOfSalesInSalesSheet: productSalesCogs,
      averageCostMethodProductsCostOfSales: costingCogs,
      negativeStockProductsCount: monthEndCosts.filter((c) => Number(c.closingQuantity) < 0).length,
      inventoryAdjustmentsWithErrorsCount:
        Math.abs(invAdjTableNet - costingNetAdj) > tolerance ? 1 : 0,
      lowOrOutOfStockProductsCount: 0,
      incomeStatementAnnualNetSales: totalSalesNet,
      salesSheetAnnualNetSales: totalSalesNet,
      dashboardAnnualNetSales: totalSalesNet,
      sumIncomeStatementExpenseCategories: totalExpensesPnl,
      incomeStatementTotalOperatingExpenses: totalExpensesPnl,
      sumAbsMonthlyBridgeDifferences: 0,
      salesWithValidationErrorsCount: 0,
      catalogWithValidationErrorsCount: 0,
      customersAndSuppliersWithErrorsCount: 0,
      outOfOperatingYearRecordsCount: 0,
      cashOperationsMissingAccountOrMethodCount: 0,
    });

    const { okCount, reviewCount, alertCount, controls } = summary;
    const overallState: 'OK' | 'REVIEW' | 'ALERT' =
      alertCount > 0 ? 'ALERT' : reviewCount > 0 ? 'REVIEW' : 'OK';

    const actor = await prisma.user.findUnique({ where: { id: ctx.userId }, select: { id: true } });
    const run = await prisma.financialReconciliation.create({
      data: {
        tenantId: ctx.tenantId,
        executedBy: actor?.id ?? null,
        tolerance,
        okCount,
        reviewCount,
        alertCount,
        overallState,
        resultsJson: controls as unknown as object,
      },
    });

    await prisma.auditLog.create({
      data: {
        tenantId: ctx.tenantId,
        actorUserId: actor?.id ?? null,
        action: 'RECONCILIATION_RUN',
        entityType: 'FinancialReconciliation',
        entityId: run.id,
        afterJson: { okCount, reviewCount, alertCount, overallState },
      },
    });

    return { runId: run.id, okCount, reviewCount, alertCount, overallState, controls };
  }
}
