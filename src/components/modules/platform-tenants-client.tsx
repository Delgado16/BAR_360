'use client';

import React, { useState, useTransition } from 'react';
import {
  createPlatformTenantAction,
  toggleTenantStatusAction,
} from '@/app/(platform)/platform/actions';

export interface PlatformTenantRow {
  id: string;
  slug: string;
  tradeName: string;
  currencyCode: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'TRIAL_EXPIRED' | 'ARCHIVED';
}

export function PlatformTenantsClient({ tenants }: { tenants: PlatformTenantRow[] }) {
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleCreate(formData: FormData) {
    startTransition(async () => {
      const res = await createPlatformTenantAction(formData);
      setFeedback(res);
    });
  }

  function handleToggle(id: string, nextStatus: 'ACTIVE' | 'SUSPENDED') {
    startTransition(async () => {
      const res = await toggleTenantStatusAction(id, nextStatus);
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
        action={handleCreate}
        className="rounded-xl border border-slate-800 bg-slate-900 p-5 flex flex-col sm:flex-row gap-3 items-end"
      >
        <div className="flex-1 w-full">
          <label className="block text-xs text-slate-400 mb-1">Nombre de la Nueva Empresa *</label>
          <input
            name="tradeName"
            required
            placeholder="Ej. Bar La Terraza"
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
          />
        </div>
        <div className="w-full sm:w-56">
          <label className="block text-xs text-slate-400 mb-1">Slug URL (opcional)</label>
          <input
            name="slug"
            placeholder="bar-la-terraza"
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
          />
        </div>
        <button
          type="submit"
          disabled={isPending}
          className="px-4 py-2 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold disabled:opacity-50"
        >
          + Crear Empresa
        </button>
      </form>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {tenants.map((t) => (
          <div
            key={t.id}
            className="rounded-lg border border-slate-800 bg-slate-900 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
          >
            <div>
              <div className="font-semibold text-white">{t.tradeName}</div>
              <div className="text-xs text-slate-400">
                Slug: {t.slug} • Moneda: {t.currencyCode} • Estado:{' '}
                <span className={t.status === 'ACTIVE' ? 'text-emerald-400' : 'text-rose-400'}>
                  {t.status}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {t.status === 'ACTIVE' ? (
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => handleToggle(t.id, 'SUSPENDED')}
                  className="px-2.5 py-1.5 rounded border border-rose-700 text-rose-300 hover:bg-rose-950 text-xs font-semibold"
                >
                  Suspender
                </button>
              ) : (
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => handleToggle(t.id, 'ACTIVE')}
                  className="px-2.5 py-1.5 rounded border border-emerald-700 text-emerald-300 hover:bg-emerald-950 text-xs font-semibold"
                >
                  Activar
                </button>
              )}
              <a
                href={`/${t.slug}/dashboard`}
                className="px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold"
              >
                Entrar al sistema
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
