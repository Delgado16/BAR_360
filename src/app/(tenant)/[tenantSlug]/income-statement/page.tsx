import React from 'react';
import { ensureTenantWorkspace } from '@/infrastructure/database/tenant-bootstrap';
import { IntelligencePostgresService } from '@/application/services/intelligence-pg.service';

export const dynamic = 'force-dynamic';

const intelligenceService = new IntelligencePostgresService();
const MONTH_NAMES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

export default async function IncomeStatementPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const tenant = await ensureTenantWorkspace(tenantSlug);
  const sym = tenant.settings?.currencySymbol ?? 'C$';
  const year = tenant.settings?.operatingYear ?? 2026;
  const report = await intelligenceService.getIncomeStatementReport(tenant.id, year);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
          Estado de Resultados ({year})
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Calculado en tiempo real desde PostgreSQL: Ventas Netas - Costo de Ventas - Gastos Operativos + Ajustes Netos de Inventario.
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-100 dark:bg-slate-800 text-xs uppercase text-slate-600 dark:text-slate-300">
              <tr>
                <th className="px-4 py-3">Mes</th>
                <th className="px-4 py-3 text-right">Ventas Netas</th>
                <th className="px-4 py-3 text-right">Costo Ventas</th>
                <th className="px-4 py-3 text-right">Utilidad Bruta</th>
                <th className="px-4 py-3 text-right">Gastos Op.</th>
                <th className="px-4 py-3 text-right">Ajustes Inv.</th>
                <th className="px-4 py-3 text-right">Utilidad Op. Est.</th>
                <th className="px-4 py-3 text-right">Margen Op.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {report.months.map((m) => (
                <tr key={m.month} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <td className="px-4 py-2.5 font-semibold">{MONTH_NAMES[m.month - 1]}</td>
                  <td className="px-4 py-2.5 text-right font-mono">{sym} {m.netSales.toFixed(2)}</td>
                  <td className="px-4 py-2.5 text-right font-mono">{sym} {m.cogs.toFixed(2)}</td>
                  <td className="px-4 py-2.5 text-right font-mono font-semibold">{sym} {m.grossProfit.toFixed(2)}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-rose-600">{sym} {m.operatingExpenses.toFixed(2)}</td>
                  <td className="px-4 py-2.5 text-right font-mono">{sym} {m.inventoryAdjustments.toFixed(2)}</td>
                  <td className="px-4 py-2.5 text-right font-mono font-bold text-blue-600">{sym} {m.operatingProfit.toFixed(2)}</td>
                  <td className="px-4 py-2.5 text-right font-mono">{(m.operatingMargin * 100).toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
