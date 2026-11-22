'use client';

import React, { useState, useTransition } from 'react';
import { assignTenantSubscriptionAction } from '@/app/(platform)/platform/actions';

export function PlatformSubscriptionsClient({
  tenants,
  plans,
  subscriptions,
}: {
  tenants: Array<{ id: string; tradeName: string }>;
  plans: Array<{ id: string; name: string; code: string }>;
  subscriptions: Array<{
    id: string;
    tenantName: string;
    planName: string;
    billingInterval: string;
    status: string;
    periodEnd: string;
  }>;
}) {
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleAssign(formData: FormData) {
    startTransition(async () => {
      const res = await assignTenantSubscriptionAction(formData);
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

      {plans.length > 0 && tenants.length > 0 && (
        <form
          action={handleAssign}
          className="rounded-xl border border-slate-800 bg-slate-900 p-5 grid grid-cols-1 sm:grid-cols-5 gap-3 items-end"
        >
          <div className="sm:col-span-2">
            <label className="block text-xs text-slate-400 mb-1">Empresa</label>
            <select
              name="tenantId"
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
            >
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.tradeName}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Plan</label>
            <select
              name="planId"
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
            >
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.code})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Ciclo / Estado</label>
            <div className="flex gap-1">
              <select
                name="billingInterval"
                className="w-1/2 rounded-md border border-slate-700 bg-slate-950 px-2 py-2 text-xs text-white"
              >
                <option value="MONTHLY">Mensual</option>
                <option value="ANNUAL">Anual</option>
              </select>
              <select
                name="status"
                className="w-1/2 rounded-md border border-slate-700 bg-slate-950 px-2 py-2 text-xs text-white"
              >
                <option value="ACTIVE">ACTIVE</option>
                <option value="TRIALING">TRIALING</option>
                <option value="SUSPENDED">SUSPENDED</option>
              </select>
            </div>
          </div>
          <button
            type="submit"
            disabled={isPending}
            className="px-4 py-2 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold disabled:opacity-50"
          >
            Asignar Plan
          </button>
        </form>
      )}

      <div className="rounded-xl border border-slate-800 bg-slate-900 p-6 space-y-4">
        <h2 className="text-lg font-semibold">Suscripciones en PostgreSQL ({subscriptions.length})</h2>
        {subscriptions.length === 0 ? (
          <p className="text-sm text-slate-400">
            No hay suscripciones asignadas aún. Primero sincroniza los planes en &quot;Planes&quot; y luego asigna uno aquí.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs uppercase text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="py-2 pr-4">Empresa</th>
                  <th className="py-2 pr-4">Plan</th>
                  <th className="py-2 pr-4">Ciclo</th>
                  <th className="py-2 pr-4">Estado</th>
                  <th className="py-2 pr-4">Vence</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {subscriptions.map((s) => (
                  <tr key={s.id}>
                    <td className="py-2.5 pr-4 font-medium text-white">{s.tenantName}</td>
                    <td className="py-2.5 pr-4">{s.planName}</td>
                    <td className="py-2.5 pr-4">{s.billingInterval}</td>
                    <td className="py-2.5 pr-4 font-mono text-xs">{s.status}</td>
                    <td className="py-2.5 pr-4 font-mono text-xs text-slate-400">{s.periodEnd}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
