import React from 'react';
import { ensureTenantWorkspace } from '@/infrastructure/database/tenant-bootstrap';
import { IntelligencePostgresService } from '@/application/services/intelligence-pg.service';

export const dynamic = 'force-dynamic';

const intelligenceService = new IntelligencePostgresService();

export default async function EnterpriseDashboardPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const tenant = await ensureTenantWorkspace(tenantSlug);
  const sym = tenant.settings?.currencySymbol ?? 'C$';
  const d = await intelligenceService.getEnterpriseDashboard(tenant.id);

  const kpiCards = [
    { label: 'Ventas del Día Seleccionado', value: `${sym} ${d.selectedDaySales.toFixed(2)}`, sub: d.selectedDateStr },
    { label: 'Ventas Netas del Mes', value: `${sym} ${d.monthNetSales.toFixed(2)}`, sub: `Mes ${d.month}/${d.year}` },
    { label: 'Ventas Netas Anuales', value: `${sym} ${d.yearNetSales.toFixed(2)}`, sub: `Año ${d.year}` },
    { label: 'Costo de Productos Vendidos (Mes)', value: `${sym} ${d.monthCogs.toFixed(2)}`, sub: 'Costo histórico CPP' },
    { label: 'Utilidad Bruta (Mes)', value: `${sym} ${d.monthGrossProfit.toFixed(2)}`, sub: `Año: ${sym} ${d.yearGrossProfit.toFixed(2)}` },
    { label: 'Gastos Operativos (Mes)', value: `${sym} ${d.monthOpEx.toFixed(2)}`, sub: 'Gastos devengados' },
    { label: 'Utilidad Operativa Estimada (Mes)', value: `${sym} ${d.monthOpProfit.toFixed(2)}`, sub: 'Incluye ajustes inv.' },
    { label: 'Margen Bruto (Mes)', value: `${(d.grossMarginMonth * 100).toFixed(1)}%`, sub: 'Utilidad bruta / Ventas' },
    { label: 'Margen Operativo (Mes)', value: `${(d.opMarginMonth * 100).toFixed(1)}%`, sub: 'Utilidad op. / Ventas' },
    { label: 'Número de Ventas (Mes)', value: `${d.monthSalesCount}`, sub: `Año: ${d.yearSalesCount}` },
    { label: 'Ticket Promedio (Mes)', value: `${sym} ${d.avgTicketMonth.toFixed(2)}`, sub: 'Por factura' },
    { label: 'Cuentas por Cobrar', value: `${sym} ${d.totalReceivables.toFixed(2)}`, sub: 'Saldo pendiente' },
    { label: 'Cuentas por Pagar', value: `${sym} ${d.totalPayables.toFixed(2)}`, sub: 'Saldo pendiente' },
    { label: 'Valor del Inventario', value: `${sym} ${d.inventoryValue.toFixed(2)}`, sub: `Unidades: ${d.inventoryUnits}` },
    { label: 'Productos con Bajo Stock', value: `${d.lowStockCount}`, sub: 'Bajo mínimo o agotado' },
    { label: 'Saldo en Caja y Bancos', value: `${sym} ${d.totalCashAndBanks.toFixed(2)}`, sub: `En caja: ${sym} ${d.cashOnlyBalance.toFixed(2)}` },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            Dashboard Empresarial ({d.month}/{d.year})
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            16 indicadores en tiempo real calculados desde PostgreSQL. Ventas netas = sin impuesto.
          </p>
        </div>
        <a
          href="settings"
          className="inline-flex items-center px-3 py-2 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold"
        >
          ⚙ Cambiar mes / año de análisis
        </a>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpiCards.map((k) => (
          <div
            key={k.label}
            className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm"
          >
            <div className="text-xs font-semibold uppercase text-slate-500">{k.label}</div>
            <div className="mt-1 text-2xl font-bold font-mono text-slate-900 dark:text-slate-100">
              {k.value}
            </div>
            <div className="mt-1 text-xs text-slate-400">{k.sub}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
