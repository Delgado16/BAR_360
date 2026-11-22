import React from 'react';
import { ensureTenantWorkspace } from '@/infrastructure/database/tenant-bootstrap';
import { IntelligencePostgresService } from '@/application/services/intelligence-pg.service';

export const dynamic = 'force-dynamic';

const intelligenceService = new IntelligencePostgresService();
const MONTH_NAMES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

export default async function CashFlowPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const tenant = await ensureTenantWorkspace(tenantSlug);
  const sym = tenant.settings?.currencySymbol ?? 'C$';
  const year = tenant.settings?.operatingYear ?? 2026;
  const report = await intelligenceService.getCashFlowReport(tenant.id, year);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
          Flujo de Caja Consolidado ({year})
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Calculado desde movimientos reales de efectivo en PostgreSQL. Las transferencias internas entre cuentas propias están excluidas de los totales.
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-100 dark:bg-slate-800 text-xs uppercase text-slate-600 dark:text-slate-300">
              <tr>
                <th className="px-4 py-3">Mes</th>
                <th className="px-4 py-3 text-right">Saldo Inicial</th>
                <th className="px-4 py-3 text-right">Entradas</th>
                <th className="px-4 py-3 text-right">Salidas</th>
                <th className="px-4 py-3 text-right">Flujo Neto</th>
                <th className="px-4 py-3 text-right">Saldo Final</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {report.months.map((m) => (
                <tr key={m.month} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <td className="px-4 py-2.5 font-semibold">{MONTH_NAMES[m.month - 1]}</td>
                  <td className="px-4 py-2.5 text-right font-mono">{sym} {m.openingBalance.toFixed(2)}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-emerald-600">+{sym} {m.inflows.toFixed(2)}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-rose-600">-{sym} {m.outflows.toFixed(2)}</td>
                  <td className="px-4 py-2.5 text-right font-mono font-semibold">{sym} {m.netFlow.toFixed(2)}</td>
                  <td className="px-4 py-2.5 text-right font-mono font-bold text-blue-600">{sym} {m.closingBalance.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
