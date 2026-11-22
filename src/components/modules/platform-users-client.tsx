'use client';

import React, { useState, useTransition } from 'react';
import { toggleUserActiveAction } from '@/app/(platform)/platform/actions';

export function PlatformUsersClient({
  users,
}: {
  users: Array<{
    id: string;
    fullName: string;
    email: string;
    platformRole: string;
    isActive: boolean;
    membershipsCount: number;
  }>;
}) {
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleToggle(id: string, nextActive: boolean) {
    startTransition(async () => {
      const res = await toggleUserActiveAction(id, nextActive);
      setFeedback(res);
    });
  }

  return (
    <div className="space-y-4">
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

      <div className="rounded-xl border border-slate-800 bg-slate-900 overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-950 text-xs uppercase text-slate-400">
            <tr>
              <th className="px-4 py-3">Nombre</th>
              <th className="px-4 py-3">Correo</th>
              <th className="px-4 py-3">Rol Global</th>
              <th className="px-4 py-3">Empresas</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3 text-right">Acción</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {users.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                  No hay usuarios registrados en `public.users` todavía.
                </td>
              </tr>
            ) : (
              users.map((u) => (
                <tr key={u.id}>
                  <td className="px-4 py-3 font-medium text-white">{u.fullName}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-300">{u.email}</td>
                  <td className="px-4 py-3 text-xs">{u.platformRole}</td>
                  <td className="px-4 py-3 font-mono text-xs">{u.membershipsCount}</td>
                  <td className="px-4 py-3 text-xs">
                    <span className={u.isActive ? 'text-emerald-400' : 'text-rose-400'}>
                      {u.isActive ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => handleToggle(u.id, !u.isActive)}
                      className="px-2.5 py-1 rounded border border-slate-700 hover:bg-slate-800 text-xs font-semibold text-slate-200"
                    >
                      {u.isActive ? 'Desactivar' : 'Activar'}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
