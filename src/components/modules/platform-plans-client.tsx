'use client';

import React, { useState, useTransition } from 'react';
import { syncPlatformPlansAction } from '@/app/(platform)/platform/actions';

export function PlatformPlansSyncButton() {
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="space-y-3">
      <button
        type="button"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            const res = await syncPlatformPlansAction();
            setFeedback(res);
          })
        }
        className="px-4 py-2 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold disabled:opacity-50"
      >
        {isPending ? 'Sincronizando...' : 'Sincronizar Planes y Monedas en PostgreSQL'}
      </button>
      {feedback && (
        <div
          className={`rounded-md border px-3 py-2 text-xs ${
            feedback.ok
              ? 'border-emerald-700 bg-emerald-950/50 text-emerald-300'
              : 'border-rose-700 bg-rose-950/50 text-rose-300'
          }`}
        >
          {feedback.message}
        </div>
      )}
    </div>
  );
}
