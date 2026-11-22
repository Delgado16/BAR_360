'use client';

import React, { useState, useTransition } from 'react';
import {
  registerCashAdjustmentAction,
  transferFundsAction,
} from '@/app/(tenant)/[tenantSlug]/actions';

export function MovementsClient({
  tenantSlug,
  currencySymbol,
  accounts,
  movements,
}: {
  tenantSlug: string;
  currencySymbol: string;
  accounts: Array<{ id: string; name: string }>;
  movements: Array<{
    id: string;
    date: string;
    accountName: string;
    direction: string;
    category: string;
    amount: number;
    description: string | null;
  }>;
}) {
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  async function handleTransfer(formData: FormData) {
    startTransition(async () => {
      const res = await transferFundsAction(tenantSlug, formData);
      setFeedback(res);
    });
  }

  async function handleAdjustment(formData: FormData) {
    startTransition(async () => {
      const res = await registerCashAdjustmentAction(tenantSlug, formData);
      setFeedback(res);
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
          Movimientos y Ajustes Financieros
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Transferencias entre cuentas propias y correcciones de caja conectadas a PostgreSQL.
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <form
          action={handleTransfer}
          className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm space-y-4"
        >
          <h2 className="text-base font-semibold">Transferencia entre Cuentas</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Cuenta Origen *</label>
              <select name="sourceAccountId" required className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-white">
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Cuenta Destino *</label>
              <select
                name="destinationAccountId"
                required
                defaultValue={accounts[1]?.id ?? accounts[0]?.id}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-white"
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Fecha *</label>
              <input name="date" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Importe ({currencySymbol}) *</label>
              <input name="amount" type="number" step="0.01" min="0.01" required className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Motivo</label>
            <input name="reason" placeholder="Ej. Depósito de caja a banco" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <button type="submit" disabled={isPending} className="px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-50">
            Transferir Fondos
          </button>
        </form>

        <form
          action={handleAdjustment}
          className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm space-y-4"
        >
          <h2 className="text-base font-semibold">Ajuste / Corrección de Caja o Banco</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Cuenta *</label>
              <select name="financialAccountId" required className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-white">
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Tipo *</label>
              <select name="direction" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-white">
                <option value="INFLOW">Entrada (+)</option>
                <option value="OUTFLOW">Salida (-)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Fecha *</label>
              <input name="date" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Importe ({currencySymbol}) *</label>
              <input name="amount" type="number" step="0.01" min="0.01" required className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Motivo obligatorio *</label>
            <input name="reason" required placeholder="Ej. Saldo inicial o arqueo de caja" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <button type="submit" disabled={isPending} className="px-4 py-2 rounded-md bg-slate-800 hover:bg-slate-900 text-white text-sm font-semibold disabled:opacity-50">
            Registrar Ajuste
          </button>
        </form>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-100 dark:bg-slate-800 text-xs uppercase text-slate-600 dark:text-slate-300">
              <tr>
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Cuenta</th>
                <th className="px-4 py-3">Categoría</th>
                <th className="px-4 py-3">Dirección</th>
                <th className="px-4 py-3 text-right">Importe</th>
                <th className="px-4 py-3">Descripción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {movements.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    No hay movimientos financieros registrados aún.
                  </td>
                </tr>
              ) : (
                movements.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="px-4 py-3">{m.date}</td>
                    <td className="px-4 py-3 font-medium">{m.accountName}</td>
                    <td className="px-4 py-3 text-xs font-mono">{m.category}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                          m.direction === 'INFLOW'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {m.direction === 'INFLOW' ? 'Entrada (+)' : 'Salida (-)'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold">
                      {currencySymbol} {m.amount.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-slate-500">{m.description ?? '—'}</td>
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
