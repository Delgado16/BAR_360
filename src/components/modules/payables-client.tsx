'use client';

import React, { useState, useTransition } from 'react';
import { registerPayablePaymentAction } from '@/app/(tenant)/[tenantSlug]/actions';

export interface PayableRow {
  id: string;
  documentNumber: string;
  creditorName: string;
  sourceType: string;
  issueDate: string;
  dueDate: string;
  originalAmount: number;
  paidAmount: number;
  balanceAmount: number;
  status: string;
}

export function PayablesClient({
  tenantSlug,
  currencySymbol,
  payables,
  paymentMethods,
  accounts,
}: {
  tenantSlug: string;
  currencySymbol: string;
  payables: PayableRow[];
  paymentMethods: Array<{ id: string; name: string }>;
  accounts: Array<{ id: string; name: string }>;
}) {
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const pendingItems = payables.filter((p) => p.balanceAmount > 0);
  const firstPending = pendingItems[0];

  async function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const res = await registerPayablePaymentAction(tenantSlug, formData);
      setFeedback(res);
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Cuentas por Pagar</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Obligaciones por compras y gastos a crédito conectadas a PostgreSQL.
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

      {firstPending && (
        <form
          action={handleSubmit}
          className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm space-y-4"
        >
          <h2 className="text-base font-semibold">Registrar Pago a Proveedor / Acreedor</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Obligación *</label>
              <select
                name="accountPayableId"
                defaultValue={firstPending.id}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-white"
              >
                {pendingItems.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.documentNumber} — {p.creditorName} (Saldo: {currencySymbol} {p.balanceAmount.toFixed(2)})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Fecha *</label>
              <input
                name="date"
                type="date"
                required
                defaultValue={new Date().toISOString().slice(0, 10)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Monto a Pagar ({currencySymbol}) *
              </label>
              <input
                name="amount"
                type="number"
                step="0.01"
                min="0.01"
                required
                defaultValue={firstPending.balanceAmount}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Método de Pago *</label>
              <select name="paymentMethodId" required className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-white">
                {paymentMethods.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Cuenta Origen *</label>
              <select name="financialAccountId" required className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-white">
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Referencia</label>
              <input name="reference" placeholder="N.º cheque o transferencia" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
            </div>
          </div>
          <div className="flex justify-end">
            <button type="submit" disabled={isPending} className="px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-50">
              {isPending ? 'Registrando...' : 'Registrar Pago'}
            </button>
          </div>
        </form>
      )}

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-100 dark:bg-slate-800 text-xs uppercase text-slate-600 dark:text-slate-300">
              <tr>
                <th className="px-4 py-3">Documento</th>
                <th className="px-4 py-3">Acreedor</th>
                <th className="px-4 py-3">Fuente</th>
                <th className="px-4 py-3">Vence</th>
                <th className="px-4 py-3 text-right">Original</th>
                <th className="px-4 py-3 text-right">Pagado</th>
                <th className="px-4 py-3 text-right">Saldo</th>
                <th className="px-4 py-3">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {payables.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                    No hay cuentas por pagar registradas.
                  </td>
                </tr>
              ) : (
                payables.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="px-4 py-3 font-mono font-semibold text-blue-600">{p.documentNumber}</td>
                    <td className="px-4 py-3 font-medium">{p.creditorName}</td>
                    <td className="px-4 py-3">{p.sourceType === 'PURCHASE' ? 'Compra' : 'Gasto'}</td>
                    <td className="px-4 py-3">{p.dueDate}</td>
                    <td className="px-4 py-3 text-right font-mono">{currencySymbol} {p.originalAmount.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right font-mono text-emerald-600">{currencySymbol} {p.paidAmount.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right font-mono font-bold">{currencySymbol} {p.balanceAmount.toFixed(2)}</td>
                    <td className="px-4 py-3 text-xs font-semibold">{p.status}</td>
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
