// ============================================================================
// MI NEGOCIO PRO 360 — FASE 5: SERVICIO DE FINANZAS, TESORERÍA, CxC Y CxP
// Implementa de forma completa las hojas:
// - Hoja 8: GASTOS OPERATIVOS (contado y crédito, tratamiento fiscal recuperable/no recuperable)
// - Hoja 11: CUENTAS POR COBRAR (estados, por vencer <=7d, antigüedad en 5 tramos, cobros)
// - Hoja 12: CUENTAS POR PAGAR (unifica Compras y Gastos a crédito, antigüedad, pagos)
// - Hoja 13: CAJA Y BANCOS (saldos, desglose anticonteo doble, alertas de saldo negativo)
// - Hoja 18: REGISTRO MOVIMIENTOS Y AJUSTES (Cobros, Pagos, Transferencias, Correcciones)
// ============================================================================

import {
  type AuthenticatedTenantContext,
  assertTenantAccessAndPermission,
} from '../policies/rbac.policy.ts';
import {
  excelRound,
  type AgingBucketType,
  type SettlementStatusType,
} from '../calculations/financial-engine.ts';
import {
  EnterpriseSaaSEngine,
  type OperatingExpenseEntity,
  type CollectionRecordEntity,
  type PaymentRecordEntity,
  type BankTransferEntity,
  type CashAdjustmentEntity,
} from './enterprise-saas.service.ts';

export interface ExpenseSheetRowView extends OperatingExpenseEntity {
  paymentStatusLabel: 'Pagado' | 'Parcial' | 'Pendiente' | 'Anulado';
  controlStatus: string;
}

export interface AgingSummaryRow {
  bucket: AgingBucketType;
  label: string;
  balance: number;
  count: number;
}

export interface ReceivableSheetRowView {
  saleId: string;
  documentNumber: string;
  customerName: string;
  issueDate: string;
  dueDate: string;
  originalAmount: number;
  paidAmount: number;
  balanceAmount: number;
  daysOverdue: number;
  status: SettlementStatusType;
  statusLabel: string;
  agingBucket: AgingBucketType;
  agingLabel: string;
  conciliationStatus: 'OK' | '⚠ Sobrecobro';
}

export interface PayableSheetRowView {
  obligationId: string;
  documentNumber: string;
  creditorName: string;
  sourceType: 'PURCHASE' | 'EXPENSE';
  sourceLabel: 'Compra' | 'Gasto';
  issueDate: string;
  dueDate: string;
  originalAmount: number;
  paidAmount: number;
  balanceAmount: number;
  daysOverdue: number;
  status: SettlementStatusType;
  statusLabel: string;
  agingBucket: AgingBucketType;
  agingLabel: string;
  conciliationStatus: 'OK' | '⚠ Sobrepago';
}

const AGING_LABELS: Record<AgingBucketType, string> = {
  SETTLED: 'Saldado',
  CURRENT: 'Al corriente',
  DAYS_1_30: '1-30 días',
  DAYS_31_60: '31-60 días',
  DAYS_61_90: '61-90 días',
  DAYS_OVER_90: 'Más de 90 días',
};

function mapSettlementStatusLabel(
  status: SettlementStatusType,
  settledWord: 'Cobrado' | 'Pagado'
): string {
  switch (status) {
    case 'SETTLED':
      return settledWord;
    case 'OVERDUE':
      return 'Vencido';
    case 'DUE_SOON':
      return 'Por vencer';
    case 'PARTIAL':
      return 'Parcial';
    case 'PENDING':
    default:
      return 'Pendiente';
  }
}

export class FinanceAndTreasuryService {
  private readonly engine: EnterpriseSaaSEngine;

  constructor(engine: EnterpriseSaaSEngine) {
    this.engine = engine;
  }

  // --------------------------------------------------------------------------
  // 1. Gastos Operativos (Hoja 8: GASTOS OPERATIVOS)
  // --------------------------------------------------------------------------
  public registerExpense(
    ctx: AuthenticatedTenantContext,
    input: Parameters<EnterpriseSaaSEngine['registerOperatingExpense']>[1]
  ): OperatingExpenseEntity {
    return this.engine.registerOperatingExpense(ctx, input);
  }

  public getExpensesSheetView(
    ctx: AuthenticatedTenantContext,
    expensesList: OperatingExpenseEntity[]
  ): {
    kpis: {
      registeredCount: number;         // A5: COUNTIF(gas_Importe, ">0")
      annualIncomeStatementTotal: number; // C5: SUMIFS(gas_Resultados, ...)
      annualTotalWithTax: number;      // E5: SUMIFS(gas_Total, ...)
      alertRowsCount: number;          // G5: SUMPRODUCT((gas_Control<>"")*(gas_Control<>"OK"))
    };
    rows: ExpenseSheetRowView[];
  } {
    assertTenantAccessAndPermission(ctx, ctx.tenantId, 'expenses', 'VIEW');
    const settings = this.engine.getTenantSettings(ctx, ctx.tenantId);
    const cxpById = new Map(
      this.engine.getAccountsPayableReport(ctx).map((r) => [r.obligationId, r])
    );

    const tenantExpenses = expensesList.filter(
      (e) => e.tenantId === ctx.tenantId && e.year === settings.operatingYear
    );

    const rows: ExpenseSheetRowView[] = tenantExpenses.map((e) => {
      let paymentStatusLabel: ExpenseSheetRowView['paymentStatusLabel'] = 'Pagado';
      if (e.status === 'VOIDED') {
        paymentStatusLabel = 'Anulado';
      } else if (e.paymentCondition === 'CREDIT') {
        const cxp = cxpById.get(e.id);
        if (!cxp || cxp.balanceAmount <= settings.reconciliationTolerance) {
          paymentStatusLabel = 'Pagado';
        } else if (cxp.paidAmount > 0) {
          paymentStatusLabel = 'Parcial';
        } else {
          paymentStatusLabel = 'Pendiente';
        }
      }

      return {
        ...e,
        paymentStatusLabel,
        controlStatus: 'OK',
      };
    });

    const activeRows = rows.filter((r) => r.status === 'CONFIRMED');

    return {
      kpis: {
        registeredCount: activeRows.length,
        annualIncomeStatementTotal: activeRows.reduce(
          (sum, r) => excelRound(sum + r.incomeStatementAmount, 2),
          0
        ),
        annualTotalWithTax: activeRows.reduce(
          (sum, r) => excelRound(sum + r.totalAmount, 2),
          0
        ),
        alertRowsCount: rows.filter((r) => r.controlStatus !== 'OK').length,
      },
      rows,
    };
  }

  // --------------------------------------------------------------------------
  // 2. Cuentas por Cobrar y Cobros (Hoja 11 + Hoja 18 tblCobros)
  // --------------------------------------------------------------------------
  public registerCollection(
    ctx: AuthenticatedTenantContext,
    input: Parameters<EnterpriseSaaSEngine['registerReceivableCollection']>[1]
  ): CollectionRecordEntity {
    return this.engine.registerReceivableCollection(ctx, input);
  }

  public getReceivablesSheetView(ctx: AuthenticatedTenantContext): {
    kpis: {
      totalReceivable: number;     // A5: SUM(cxc_Saldo)
      overdueTotal: number;        // C5: SUMIFS(cxc_Saldo, cxc_Estado, "Vencido")
      openInvoicesCount: number;   // E5: Vencido + Por vencer + Parcial + Pendiente
      overdueInvoicesCount: number; // G5: COUNTIF(cxc_Estado, "Vencido")
    };
    agingSummary: AgingSummaryRow[]; // P7:R12 (5 tramos)
    rows: ReceivableSheetRowView[];
  } {
    const raw = this.engine.getAccountsReceivableReport(ctx);

    const rows: ReceivableSheetRowView[] = raw.map((r) => ({
      saleId: r.saleId,
      documentNumber: r.documentNumber,
      customerName: r.customerName,
      issueDate: r.issueDate,
      dueDate: r.dueDate,
      originalAmount: r.originalAmount,
      paidAmount: r.paidAmount,
      balanceAmount: r.balanceAmount,
      daysOverdue: r.daysOverdue,
      status: r.status,
      statusLabel: mapSettlementStatusLabel(r.status, 'Cobrado'),
      agingBucket: r.agingBucket,
      agingLabel: r.agingBucket === 'SETTLED' ? 'Cobrado' : AGING_LABELS[r.agingBucket],
      conciliationStatus: r.isOverpaid ? '⚠ Sobrecobro' : 'OK',
    }));

    const agingBuckets: AgingBucketType[] = [
      'CURRENT',
      'DAYS_1_30',
      'DAYS_31_60',
      'DAYS_61_90',
      'DAYS_OVER_90',
    ];
    const agingSummary: AgingSummaryRow[] = agingBuckets.map((bucket) => {
      const matching = rows.filter((r) => r.agingBucket === bucket);
      return {
        bucket,
        label: AGING_LABELS[bucket],
        balance: matching.reduce((s, r) => excelRound(s + r.balanceAmount, 2), 0),
        count: matching.length,
      };
    });

    return {
      kpis: {
        totalReceivable: rows.reduce((s, r) => excelRound(s + r.balanceAmount, 2), 0),
        overdueTotal: rows
          .filter((r) => r.status === 'OVERDUE')
          .reduce((s, r) => excelRound(s + r.balanceAmount, 2), 0),
        openInvoicesCount: rows.filter((r) => r.status !== 'SETTLED').length,
        overdueInvoicesCount: rows.filter((r) => r.status === 'OVERDUE').length,
      },
      agingSummary,
      rows,
    };
  }

  // --------------------------------------------------------------------------
  // 3. Cuentas por Pagar y Pagos (Hoja 12 + Hoja 18 tblPagos)
  // --------------------------------------------------------------------------
  public registerPayment(
    ctx: AuthenticatedTenantContext,
    input: Parameters<EnterpriseSaaSEngine['registerPayablePayment']>[1]
  ): PaymentRecordEntity {
    return this.engine.registerPayablePayment(ctx, input);
  }

  public getPayablesSheetView(ctx: AuthenticatedTenantContext): {
    kpis: {
      totalPayable: number;            // A5: SUM(cxp_Saldo)
      overdueTotal: number;            // C5: SUMIFS(cxp_Saldo, cxp_Estado, "Vencido")
      openObligationsCount: number;    // E5
      overdueObligationsCount: number; // G5
    };
    agingSummary: AgingSummaryRow[];
    rows: PayableSheetRowView[];
  } {
    const raw = this.engine.getAccountsPayableReport(ctx);

    const rows: PayableSheetRowView[] = raw.map((r) => ({
      obligationId: r.obligationId,
      documentNumber: r.documentNumber,
      creditorName: r.creditorName,
      sourceType: r.sourceType,
      sourceLabel: r.sourceType === 'PURCHASE' ? 'Compra' : 'Gasto',
      issueDate: r.issueDate,
      dueDate: r.dueDate,
      originalAmount: r.originalAmount,
      paidAmount: r.paidAmount,
      balanceAmount: r.balanceAmount,
      daysOverdue: r.daysOverdue,
      status: r.status,
      statusLabel: mapSettlementStatusLabel(r.status, 'Pagado'),
      agingBucket: r.agingBucket,
      agingLabel: r.agingBucket === 'SETTLED' ? 'Pagado' : AGING_LABELS[r.agingBucket],
      conciliationStatus: r.isOverpaid ? '⚠ Sobrepago' : 'OK',
    }));

    const agingBuckets: AgingBucketType[] = [
      'CURRENT',
      'DAYS_1_30',
      'DAYS_31_60',
      'DAYS_61_90',
      'DAYS_OVER_90',
    ];
    const agingSummary: AgingSummaryRow[] = agingBuckets.map((bucket) => {
      const matching = rows.filter((r) => r.agingBucket === bucket);
      return {
        bucket,
        label: AGING_LABELS[bucket],
        balance: matching.reduce((s, r) => excelRound(s + r.balanceAmount, 2), 0),
        count: matching.length,
      };
    });

    return {
      kpis: {
        totalPayable: rows.reduce((s, r) => excelRound(s + r.balanceAmount, 2), 0),
        overdueTotal: rows
          .filter((r) => r.status === 'OVERDUE')
          .reduce((s, r) => excelRound(s + r.balanceAmount, 2), 0),
        openObligationsCount: rows.filter((r) => r.status !== 'SETTLED').length,
        overdueObligationsCount: rows.filter((r) => r.status === 'OVERDUE').length,
      },
      agingSummary,
      rows,
    };
  }

  // --------------------------------------------------------------------------
  // 4. Caja y Bancos, Transferencias y Correcciones Justificadas (Hojas 13 y 18)
  // --------------------------------------------------------------------------
  public registerTransfer(
    ctx: AuthenticatedTenantContext,
    input: Parameters<EnterpriseSaaSEngine['registerBankTransfer']>[1]
  ): BankTransferEntity {
    return this.engine.registerBankTransfer(ctx, input);
  }

  public registerCashAdjustment(
    ctx: AuthenticatedTenantContext,
    input: Parameters<EnterpriseSaaSEngine['registerCashAdjustment']>[1]
  ): CashAdjustmentEntity {
    return this.engine.registerCashAdjustment(ctx, input);
  }

  public getCashAndBanksSheetView(ctx: AuthenticatedTenantContext) {
    const accounts = this.engine.getCashAndBanksReport(ctx);

    const totalBalance = accounts.reduce((s, a) => excelRound(s + a.currentBalance, 2), 0);
    const cashBalance = accounts
      .filter((a) => a.accountType === 'CASH')
      .reduce((s, a) => excelRound(s + a.currentBalance, 2), 0);
    const banksAndWalletsBalance = accounts
      .filter((a) => a.accountType === 'BANK' || a.accountType === 'DIGITAL_WALLET')
      .reduce((s, a) => excelRound(s + a.currentBalance, 2), 0);
    const negativeAccountsCount = accounts.filter((a) => a.hasNegativeWarning).length;

    // Verificar conciliación interna de transferencias (entrantes === salientes)
    const totalTransfersIn = accounts.reduce((s, a) => excelRound(s + a.transfersIn, 2), 0);
    const totalTransfersOut = accounts.reduce((s, a) => excelRound(s + a.transfersOut, 2), 0);
    const transfersNetDiff = excelRound(totalTransfersIn - totalTransfersOut, 2);

    return {
      kpis: {
        totalBalance,           // A5: SUM(caja_Saldo)
        cashBalance,            // C5: SUMIFS(caja_Saldo, caja_Tipo, "Caja")
        banksAndWalletsBalance, // E5: Banco + Billetera digital
        negativeAccountsCount,  // G5: COUNTIF(caja_Estado, "⚠*")
      },
      transfersNetDiff,
      accounts,
    };
  }
}
