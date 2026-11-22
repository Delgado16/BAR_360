'use client';

import React, { useState, useTransition } from 'react';
import { updateBusinessSettingsAction } from '@/app/(tenant)/[tenantSlug]/actions';

export function SettingsClient({
  tenantSlug,
  initial,
}: {
  tenantSlug: string;
  initial: {
    tradeName: string;
    currencyCode: string;
    currencySymbol: string;
    operatingYear: number;
    analysisMonth: number;
    taxTreatment: 'RECOVERABLE' | 'NON_RECOVERABLE';
    allowNegativeStock: boolean;
  };
}) {
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const res = await updateBusinessSettingsAction(tenantSlug, formData);
      setFeedback(res);
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
          Configuración del Negocio
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Parámetros fiscales, período de análisis y políticas de inventario en PostgreSQL.
        </p>
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

      <form
        action={handleSubmit}
        className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm space-y-4 max-w-2xl"
      >
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Nombre Comercial *</label>
          <input
            name="tradeName"
            required
            defaultValue={initial.tradeName}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Moneda</label>
            <input
              disabled
              value={`${initial.currencyCode} (${initial.currencySymbol})`}
              className="w-full rounded-md border border-slate-200 bg-slate-100 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Año Operativo</label>
            <input
              name="operatingYear"
              type="number"
              min={2020}
              max={2035}
              defaultValue={initial.operatingYear}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Mes de Análisis (1-12)</label>
            <input
              name="analysisMonth"
              type="number"
              min={1}
              max={12}
              defaultValue={initial.analysisMonth}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">
            Tratamiento del Impuesto en Compras y Gastos
          </label>
          <select
            name="taxTreatment"
            defaultValue={initial.taxTreatment}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-white"
          >
            <option value="RECOVERABLE">Recuperable (No se suma al costo de inventario)</option>
            <option value="NON_RECOVERABLE">No Recuperable (Se capitaliza al costo)</option>
          </select>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="allowNegativeStock"
            defaultChecked={initial.allowNegativeStock}
            className="rounded border-slate-300"
          />
          Permitir ventas con stock negativo (no recomendado)
        </label>

        <div className="pt-2">
          <button
            type="submit"
            disabled={isPending}
            className="px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-50"
          >
            {isPending ? 'Guardando...' : 'Guardar Configuración'}
          </button>
        </div>
      </form>
    </div>
  );
}
