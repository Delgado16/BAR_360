'use client';

import React, { useState, useTransition } from 'react';
import { createSupportIncidentAction } from '@/app/(platform)/platform/actions';

export function PlatformIncidentsClient({
  tenants,
  incidents,
}: {
  tenants: Array<{ id: string; tradeName: string }>;
  incidents: Array<{ id: string; createdAt: string; tenantName: string; reason: string }>;
}) {
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const res = await createSupportIncidentAction(formData);
      setFeedback(res);
    });
  }

  return (
    <div className="space-y-6">
      {feedback && (
        <div
          className={`rounded-md border px-4 py-2.5 text-sm ${
            feedback.ok
              ? 'border-emerald-700 bg-emerald-950/50 text-emerald-300'
              : 'border-rose-700 bg-rose-950/50 text-rose-300'
          }`}
        >
          {feedback.message}
        </div>
      )}

      <form
        action={handleSubmit}
        className="rounded-xl border border-slate-800 bg-slate-900 p-5 space-y-3"
      >
        <h2 className="text-base font-semibold">Registrar Ticket de Soporte / Incidencia</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Empresa (opcional)</label>
            <select
              name="tenantId"
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
            >
              <option value="">— Plataforma Global —</option>
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.tradeName}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs text-slate-400 mb-1">Descripción / Justificación *</label>
            <input
              name="reason"
              required
              placeholder="Ej. Ticket #104: Revisión de impresora térmica en Fronteras Bar"
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
            />
          </div>
        </div>
        <button
          type="submit"
          disabled={isPending}
          className="px-4 py-2 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold disabled:opacity-50"
        >
          + Registrar Incidencia Auditada
        </button>
      </form>

      <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 space-y-3">
        <h2 className="text-base font-semibold">Historial de Incidencias ({incidents.length})</h2>
        {incidents.length === 0 ? (
          <p className="text-sm text-slate-400">No hay incidencias registradas.</p>
        ) : (
          <div className="space-y-2">
            {incidents.map((inc) => (
              <div key={inc.id} className="rounded border border-slate-800 bg-slate-950 p-3 text-sm">
                <div className="flex justify-between text-xs text-slate-400">
                  <span>{inc.tenantName}</span>
                  <span className="font-mono">{inc.createdAt}</span>
                </div>
                <div className="mt-1 text-slate-200">{inc.reason}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
