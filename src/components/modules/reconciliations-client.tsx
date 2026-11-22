'use client';

import React, { useState, useTransition } from 'react';
import { runReconciliationAction } from '@/app/(tenant)/[tenantSlug]/actions';

export interface ControlRow {
  code: number;
  area: string;
  description: string;
  valueA: number;
  valueB: number;
  difference: number;
  state: 'OK' | 'REVISAR' | 'ALERTA';
  recommendedAction: string;
}

export function ReconciliationsClient({
  tenantSlug,
  currencySymbol,
  lastRunAt,
  okCount,
  reviewCount,
  alertCount,
  controls,
}: {
  tenantSlug: string;
  currencySymbol: string;
  lastRunAt: string | null;
  okCount: number;
  reviewCount: number;
  alertCount: number;
  controls: ControlRow[];
}) {
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleRun() {
    startTransition(async () => {
      const res = await runReconciliationAction(tenantSlug);
      setFeedback(res);
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            Centro de Control y Conciliación (31 Controles)
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Audita Ventas, CxC, Compras, CxP, Caja, Flujo, Inventario, CPP y Resultados directamente contra PostgreSQL.
            {lastRunAt ? ` Última ejecución: ${lastRunAt}.` : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={handleRun}
          disabled={isPending}
          className="inline-flex items-center px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold shadow-sm disabled:opacity-50"
        >
          {isPending ? 'Conciliando...' : 'Ejecutar Conciliación Ahora'}
        </button>
      </div>

      {feedback && (
        <div
          className={`rounded-md border px-4 py-2.5 text-sm ${
            feedback.ok
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-red-200 bg-red-50 text-red-800'
          }`}
        >
          {feedback.message}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
          <div className="text-xs font-semibold uppercase text-emerald-700">Controles OK</div>
          <div className="mt-1 text-2xl font-bold text-emerald-800">{okCount} / 31</div>
        </div>
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <div className="text-xs font-semibold uppercase text-amber-700">Por Revisar</div>
          <div className="mt-1 text-2xl font-bold text-amber-800">{reviewCount}</div>
        </div>
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-4">
          <div className="text-xs font-semibold uppercase text-rose-700">Alertas</div>
          <div className="mt-1 text-2xl font-bold text-rose-800">{alertCount}</div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-100 dark:bg-slate-800 text-xs uppercase text-slate-600 dark:text-slate-300">
              <tr>
                <th className="px-4 py-3">#</th>
                <th className="px-4 py-3">Área</th>
                <th className="px-4 py-3">Control</th>
                <th className="px-4 py-3 text-right">Valor A</th>
                <th className="px-4 py-3 text-right">Valor B</th>
                <th className="px-4 py-3 text-right">Diferencia</th>
                <th className="px-4 py-3">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {controls.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                    Aún no se ha ejecutado una conciliación guardada. Haz clic en &quot;Ejecutar Conciliación Ahora&quot;.
                  </td>
                </tr>
              ) : (
                controls.map((c) => (
                  <tr key={c.code} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="px-4 py-2.5 font-mono font-semibold">{c.code}</td>
                    <td className="px-4 py-2.5 text-xs">{c.area}</td>
                    <td className="px-4 py-2.5">{c.description}</td>
                    <td className="px-4 py-2.5 text-right font-mono">{currencySymbol} {c.valueA.toFixed(2)}</td>
                    <td className="px-4 py-2.5 text-right font-mono">{currencySymbol} {c.valueB.toFixed(2)}</td>
                    <td className="px-4 py-2.5 text-right font-mono">{c.difference.toFixed(2)}</td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                          c.state === 'OK'
                            ? 'bg-emerald-100 text-emerald-800'
                            : c.state === 'REVISAR'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {c.state}
                      </span>
                    </td>
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
