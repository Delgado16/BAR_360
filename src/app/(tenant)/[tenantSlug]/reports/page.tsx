// ============================================================================
// MI NEGOCIO PRO 360 — MÓDULO WEB: REPORTES EMPRESARIALES (Hoja 16 + Sección 17)
// ============================================================================

import React from 'react';

export default function ReportsCenterPage() {
  const reportsList = [
    '1 · Ventas diarias del mes de análisis',
    '2 · Ventas mensuales del año',
    '3 · Productos más vendidos (Top 10)',
    '4 · Productos menos vendidos (10 últimos activos)',
    '5 · Rentabilidad por producto (Top 30)',
    '6 · Gastos por categoría',
    '7 · Clientes principales (excluye mostrador)',
    '8 · Inventario crítico y reposición sugerida',
    '9 · Cuentas por cobrar vencidas',
    '10 · Cuentas por pagar vencidas',
    '11 · Cobros por método de pago',
    '12 · Ventas por categoría',
    '13 · Flujo de caja consolidado',
    '14 · Evolución mensual de ventas y utilidades',
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
          Reportes Empresariales
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          14 reportes automáticos sincronizados con sus registros fuente y exportables a Excel y PDF.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {reportsList.map((title) => (
          <div
            key={title}
            className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm flex items-center justify-between"
          >
            <span className="text-sm font-medium">{title}</span>
            <button
              type="button"
              className="px-2.5 py-1 rounded bg-slate-100 dark:bg-slate-800 text-xs font-semibold hover:bg-blue-600 hover:text-white transition-colors"
            >
              Ver
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
