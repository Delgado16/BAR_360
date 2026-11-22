import React from 'react';
import { ensureTenantWorkspace } from '@/infrastructure/database/tenant-bootstrap';
import { InventoryPostgresService } from '@/application/services/inventory-pg.service';

export const dynamic = 'force-dynamic';

const inventoryService = new InventoryPostgresService();

export default async function InventoryPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const tenant = await ensureTenantWorkspace(tenantSlug);
  const year = tenant.settings?.operatingYear ?? 2026;
  const month = tenant.settings?.analysisMonth ?? 11;
  const currencySymbol = tenant.settings?.currencySymbol ?? 'C$';

  const rows = await inventoryService.listInventoryValuation(tenant.id, year, month);
  const totalValue = rows.reduce((sum, r) => sum + r.inventoryValue, 0);
  const totalUnits = rows.reduce((sum, r) => sum + r.finalStock, 0);
  const lowStockCount = rows.filter((r) => r.state === 'LOW_STOCK' || r.state === 'OUT_OF_STOCK').length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
          Inventario y Valoración CPP ({month}/{year})
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Conectado en tiempo real a `inventory_monthly_costs` y `inventory_movements` en PostgreSQL.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <div className="text-xs font-semibold uppercase text-slate-500">Valor Total Inventario</div>
          <div className="mt-1 text-2xl font-bold font-mono text-blue-600">
            {currencySymbol} {totalValue.toFixed(2)}
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <div className="text-xs font-semibold uppercase text-slate-500">Unidades en Stock</div>
          <div className="mt-1 text-2xl font-bold font-mono">{totalUnits}</div>
        </div>
        <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <div className="text-xs font-semibold uppercase text-slate-500">Alertas de Reposición</div>
          <div className="mt-1 text-2xl font-bold font-mono text-amber-600">{lowStockCount}</div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-100 dark:bg-slate-800 text-xs uppercase text-slate-600 dark:text-slate-300">
              <tr>
                <th className="px-4 py-3">SKU</th>
                <th className="px-4 py-3">Producto</th>
                <th className="px-4 py-3 text-right">Inicial</th>
                <th className="px-4 py-3 text-right">Compras</th>
                <th className="px-4 py-3 text-right">Ventas</th>
                <th className="px-4 py-3 text-right">Stock Final</th>
                <th className="px-4 py-3 text-right">CPP Mes</th>
                <th className="px-4 py-3 text-right">Valor</th>
                <th className="px-4 py-3">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-slate-500">
                    No hay productos registrados en esta empresa.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.productId} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="px-4 py-3 font-mono font-semibold text-blue-600">{r.sku}</td>
                    <td className="px-4 py-3 font-medium">{r.name}</td>
                    <td className="px-4 py-3 text-right font-mono">{r.openingQuantity}</td>
                    <td className="px-4 py-3 text-right font-mono">{r.purchasedQuantity}</td>
                    <td className="px-4 py-3 text-right font-mono">{r.soldQuantity}</td>
                    <td className="px-4 py-3 text-right font-mono font-bold">{r.finalStock}</td>
                    <td className="px-4 py-3 text-right font-mono">
                      {currencySymbol} {r.weightedAverageCost.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold">
                      {currencySymbol} {r.inventoryValue.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-xs font-semibold">{r.state}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
