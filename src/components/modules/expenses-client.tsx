'use client';

import React, { useState, useTransition } from 'react';
import { createExpenseAction } from '@/app/(tenant)/[tenantSlug]/actions';

export interface ExpenseRow {
  id: string;
  expenseNumber: string;
  date: string;
  categoryName: string;
  description: string;
  netAmount: number;
  taxAmount: number;
  totalAmount: number;
  paymentCondition: string;
  paymentStatus: string;
}

export function ExpensesClient({
  tenantSlug,
  currencySymbol,
  expenses,
  categories,
  taxProfiles,
  paymentMethods,
  accounts,
}: {
  tenantSlug: string;
  currencySymbol: string;
  expenses: ExpenseRow[];
  categories: Array<{ id: string; name: string }>;
  taxProfiles: Array<{ id: string; name: string; rate: number }>;
  paymentMethods: Array<{ id: string; name: string }>;
  accounts: Array<{ id: string; name: string }>;
}) {
  const [showForm, setShowForm] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  async function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const res = await createExpenseAction(tenantSlug, formData);
      setFeedback(res);
      if (res.ok) setShowForm(false);
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Gastos Operativos</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Registro de gastos conectado a PostgreSQL, CxP y Caja/Bancos.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setFeedback(null);
            setShowForm((prev) => !prev);
          }}
          className="inline-flex items-center px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold shadow-sm"
        >
          {showForm ? 'Cerrar Formulario' : '+ Nuevo Gasto'}
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

      {showForm && (
        <form
          action={handleSubmit}
          className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm space-y-4"
        >
          <h2 className="text-base font-semibold">Registrar Gasto Operativo</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
              <label className="block text-xs font-medium text-slate-600 mb-1">Categoría *</label>
              <select name="categoryId" required className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-white">
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Descripción *</label>
              <input
                name="description"
                required
                placeholder="Ej. Pago de energía eléctrica"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Importe Neto ({currencySymbol}) *
              </label>
              <input
                name="netAmount"
                type="number"
                step="0.01"
                min="0.01"
                required
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Impuesto *</label>
              <select name="taxProfileId" required className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-white">
                {taxProfiles.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Condición *</label>
              <select name="paymentCondition" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-white">
                <option value="CASH">Contado</option>
                <option value="CREDIT">Crédito (CxP)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Método de Pago</label>
              <select name="paymentMethodId" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-white">
                {paymentMethods.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Cuenta</label>
              <select name="financialAccountId" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-white">
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 rounded-md border border-slate-300 text-sm">
              Cancelar
            </button>
            <button type="submit" disabled={isPending} className="px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-50">
              {isPending ? 'Guardando...' : 'Guardar Gasto'}
            </button>
          </div>
        </form>
      )}

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-100 dark:bg-slate-800 text-xs uppercase text-slate-600 dark:text-slate-300">
              <tr>
                <th className="px-4 py-3">N.º</th>
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Categoría</th>
                <th className="px-4 py-3">Descripción</th>
                <th className="px-4 py-3">Condición</th>
                <th className="px-4 py-3 text-right">Neto</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {expenses.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                    No hay gastos registrados aún.
                  </td>
                </tr>
              ) : (
                expenses.map((e) => (
                  <tr key={e.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="px-4 py-3 font-mono font-semibold text-blue-600">{e.expenseNumber}</td>
                    <td className="px-4 py-3">{e.date}</td>
                    <td className="px-4 py-3">{e.categoryName}</td>
                    <td className="px-4 py-3">{e.description}</td>
                    <td className="px-4 py-3">{e.paymentCondition === 'CASH' ? 'Contado' : 'Crédito'}</td>
                    <td className="px-4 py-3 text-right font-mono">{currencySymbol} {e.netAmount.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right font-mono font-semibold">{currencySymbol} {e.totalAmount.toFixed(2)}</td>
                    <td className="px-4 py-3 text-xs font-semibold">{e.paymentStatus}</td>
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
