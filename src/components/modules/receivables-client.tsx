'use client';

import React, { useState, useTransition } from 'react';
import { registerReceivablePaymentAction } from '@/app/(tenant)/[tenantSlug]/actions';

export interface ReceivableRow {
  id: string;
  documentNumber: string;
  customerName: string;
  issueDate: string;
  dueDate: string;
  originalAmount: number;
  paidAmount: number;
  balanceAmount: number;
  status: string;
}

export function ReceivablesClient({
  tenantSlug,
  currencySymbol,
  receivables,
  paymentMethods,
  accounts,
}: {
  tenantSlug: string;
  currencySymbol: string;
  receivables: ReceivableRow[];
  paymentMethods: Array<{ id: string; name: string }>;
  accounts: Array<{ id: string; name: string }>;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const pendingItems = receivables.filter((r) => r.balanceAmount > 0);
  const selectedItem = pendingItems.find((r) => r.id === selectedId) ?? pendingItems[0];

  async function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const res = await registerReceivablePaymentAction(tenantSlug, formData);
      setFeedback(res);
      if (res.ok) setSelectedId(null);
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Cuentas por Cobrar</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Control de facturas a crédito y registro de cobros parciales o totales en PostgreSQL.
          </p>
        </div>
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

      {selectedItem && (
        <form
          action={handleSubmit}
          className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm space-y-4"
        >
          <h2 className="text-base font-semibold">Registrar Cobro a Cliente</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Factura *</label>
              <select
                name="accountReceivableId"
                defaultValue={selectedItem.id}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-white"
              >
                {pendingItems.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.documentNumber} — {r.customerName} (Saldo: {currencySymbol} {r.balanceAmount.toFixed(2)})
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
                Monto a Cobrar ({currencySymbol}) *
              </label>
              <input
                name="amount"
                type="number"
                step="0.01"
                min="0.01"
                required
                defaultValue={selectedItem.balanceAmount}
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
              <label className="block text-xs font-medium text-slate-600 mb-1">Cuenta Receptora *</label>
              <select name="financialAccountId" required className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-white">
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Referencia</label>
              <input name="reference" placeholder="N.º recibo o transferencia" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
            </div>
          </div>
          <div className="flex justify-end">
            <button type="submit" disabled={isPending} className="px-4 py-2 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold disabled:opacity-50">
              {isPending ? 'Registrando...' : 'Registrar Cobro'}
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
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Emisión</th>
                <th className="px-4 py-3">Vence</th>
                <th className="px-4 py-3 text-right">Original</th>
                <th className="px-4 py-3 text-right">Abonos</th>
                <th className="px-4 py-3 text-right">Saldo</th>
                <th className="px-4 py-3">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {receivables.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                    No hay cuentas por cobrar registradas. Crea una venta a crédito para generar una CxC.
                  </td>
                </tr>
              ) : (
                receivables.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="px-4 py-3 font-mono font-semibold text-blue-600">{r.documentNumber}</td>
                    <td className="px-4 py-3 font-medium">{r.customerName}</td>
                    <td className="px-4 py-3">{r.issueDate}</td>
                    <td className="px-4 py-3">{r.dueDate}</td>
                    <td className="px-4 py-3 text-right font-mono">{currencySymbol} {r.originalAmount.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right font-mono text-emerald-600">{currencySymbol} {r.paidAmount.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right font-mono font-bold">{currencySymbol} {r.balanceAmount.toFixed(2)}</td>
                    <td className="px-4 py-3 text-xs font-semibold">{r.status}</td>
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
