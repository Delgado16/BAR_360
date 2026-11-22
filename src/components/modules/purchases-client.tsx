'use client';

import React, { useState, useTransition } from 'react';
import { createPurchaseAction } from '@/app/(tenant)/[tenantSlug]/actions';

export interface PurchaseRow {
  id: string;
  purchaseNumber: string;
  date: string;
  supplierName: string;
  paymentCondition: string;
  paymentStatus: string;
  netSubtotal: number;
  taxTotal: number;
  grandTotal: number;
}

export function PurchasesClient({
  tenantSlug,
  currencySymbol,
  purchases,
  suppliers,
  products,
  taxProfiles,
  accounts,
}: {
  tenantSlug: string;
  currencySymbol: string;
  purchases: PurchaseRow[];
  suppliers: Array<{ id: string; name: string }>;
  products: Array<{ id: string; sku: string; name: string; referenceCost: number }>;
  taxProfiles: Array<{ id: string; name: string; rate: number }>;
  accounts: Array<{ id: string; name: string }>;
}) {
  const [showForm, setShowForm] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  async function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const res = await createPurchaseAction(tenantSlug, formData);
      setFeedback(res);
      if (res.ok) setShowForm(false);
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Compras</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Registro de compras conectado a PostgreSQL e inventario.
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
          {showForm ? 'Cerrar Formulario' : '+ Nueva Compra'}
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
          <h2 className="text-base font-semibold">Registrar Compra de Mercadería</h2>
          {suppliers.length === 0 || products.length === 0 ? (
            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded p-3">
              Primero debes registrar al menos un Proveedor y un Producto (tipo Producto) antes de crear una compra.
            </p>
          ) : (
            <>
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
                  <label className="block text-xs font-medium text-slate-600 mb-1">Proveedor *</label>
                  <select
                    name="supplierId"
                    required
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-white"
                  >
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Producto *</label>
                  <select
                    name="productId"
                    required
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-white"
                  >
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.sku} — {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Cantidad *</label>
                  <input
                    name="quantity"
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    defaultValue="10"
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Costo Unitario ({currencySymbol}) *
                  </label>
                  <input
                    name="unitCost"
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    defaultValue={products[0]?.referenceCost ?? 0}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Descuento (%)</label>
                  <input
                    name="discountPercentage"
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    defaultValue="0"
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Impuesto *</label>
                  <select
                    name="taxProfileId"
                    required
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-white"
                  >
                    {taxProfiles.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({(t.rate * 100).toFixed(0)}%)
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Condición *</label>
                  <select
                    name="paymentCondition"
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-white"
                  >
                    <option value="CASH">Contado</option>
                    <option value="CREDIT">Crédito (CxP)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Cuenta Pago</label>
                  <select
                    name="financialAccountId"
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-white"
                  >
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-4 py-2 rounded-md border border-slate-300 text-sm"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-50"
                >
                  {isPending ? 'Guardando...' : 'Guardar Compra'}
                </button>
              </div>
            </>
          )}
        </form>
      )}

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-100 dark:bg-slate-800 text-xs uppercase text-slate-600 dark:text-slate-300">
              <tr>
                <th className="px-4 py-3">N.º Compra</th>
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Proveedor</th>
                <th className="px-4 py-3">Condición</th>
                <th className="px-4 py-3 text-right">Subtotal</th>
                <th className="px-4 py-3 text-right">Impuesto</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {purchases.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                    No hay compras registradas aún.
                  </td>
                </tr>
              ) : (
                purchases.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="px-4 py-3 font-mono font-semibold text-blue-600">
                      {p.purchaseNumber}
                    </td>
                    <td className="px-4 py-3">{p.date}</td>
                    <td className="px-4 py-3 font-medium">{p.supplierName}</td>
                    <td className="px-4 py-3">{p.paymentCondition === 'CASH' ? 'Contado' : 'Crédito'}</td>
                    <td className="px-4 py-3 text-right font-mono">
                      {currencySymbol} {p.netSubtotal.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {currencySymbol} {p.taxTotal.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold">
                      {currencySymbol} {p.grandTotal.toFixed(2)}
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded-full text-xs bg-emerald-100 text-emerald-800 font-medium">
                        {p.paymentStatus}
                      </span>
                    </td>
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
