import React from 'react';
import { ensureTenantWorkspace } from '@/infrastructure/database/tenant-bootstrap';
import { FinancePostgresService } from '@/application/services/finance-pg.service';

export const dynamic = 'force-dynamic';

const financeService = new FinancePostgresService();

export default async function CashAndBanksPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const tenant = await ensureTenantWorkspace(tenantSlug);
  const currencySymbol = tenant.settings?.currencySymbol ?? 'C$';
  const accounts = await financeService.listAccountBalances(tenant.id);
  const totalBalance = accounts.reduce((s, a) => s + a.currentBalance, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Caja y Bancos</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Saldos reales reconstruidos desde `cash_movements` en PostgreSQL.
          </p>
        </div>
        <a
          href="movements"
          className="inline-flex items-center px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold"
        >
          Registrar Transferencia o Ajuste
        </a>
      </div>

      <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
        <div className="text-xs font-semibold uppercase text-slate-500">Saldo Consolidado</div>
        <div className="mt-1 text-3xl font-bold font-mono text-emerald-600">
          {currencySymbol} {totalBalance.toFixed(2)}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {accounts.map((acc) => (
          <div
            key={acc.id}
            className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-3 shadow-sm"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">{acc.name}</h2>
              <span className="text-xs px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-mono">
                {acc.type}
              </span>
            </div>
            <div className="text-2xl font-bold font-mono text-blue-600">
              {currencySymbol} {acc.currentBalance.toFixed(2)}
            </div>
            <div className="grid grid-cols-3 gap-2 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
              <div>
                <div className="text-slate-500">Inicial</div>
                <div className="font-mono font-semibold">{currencySymbol} {acc.openingBalance.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-slate-500">Entradas</div>
                <div className="font-mono font-semibold text-emerald-600">+{currencySymbol} {acc.totalInflows.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-slate-500">Salidas</div>
                <div className="font-mono font-semibold text-rose-600">-{currencySymbol} {acc.totalOutflows.toFixed(2)}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
