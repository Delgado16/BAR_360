'use client';

import React, { useState, useTransition } from 'react';
import { createProductAction } from '@/app/(tenant)/[tenantSlug]/actions';

export interface ProductRow {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  categoryName: string;
  type: 'PRODUCT' | 'SERVICE';
  unitName: string;
  salePrice: number;
  referenceCost: number;
  supplierName: string;
  minimumStock: number;
  status: string;
}

interface ProductsClientProps {
  tenantSlug: string;
  currencySymbol: string;
  products: ProductRow[];
  categories: Array<{ id: string; name: string }>;
  units: Array<{ id: string; name: string }>;
  suppliers: Array<{ id: string; name: string }>;
}

export function ProductsClient({
  tenantSlug,
  currencySymbol,
  products,
  categories,
  units,
  suppliers,
}: ProductsClientProps) {
  const [showForm, setShowForm] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  async function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const res = await createProductAction(tenantSlug, formData);
      setFeedback(res);
      if (res.ok) {
        setShowForm(false);
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            Productos y Servicios
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Catálogo maestro conectado a PostgreSQL. Los servicios no llevan inventario.
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
          {showForm ? 'Cerrar Formulario' : '+ Nuevo Producto / Servicio'}
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
          <h2 className="text-base font-semibold">Registrar Producto o Servicio</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">SKU *</label>
              <input
                name="sku"
                required
                placeholder="Ej. SKU01"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Nombre *</label>
              <input
                name="name"
                required
                placeholder="Ej. Cerveza Toña 1L"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Tipo *</label>
              <select
                name="type"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-white"
              >
                <option value="PRODUCT">Producto (Con inventario)</option>
                <option value="SERVICE">Servicio (Sin inventario)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Categoría *</label>
              <select
                name="categoryId"
                required
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-white"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Unidad *</label>
              <select
                name="unitId"
                required
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-white"
              >
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Proveedor Preferido
              </label>
              <select
                name="preferredSupplierId"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-white"
              >
                <option value="">— Opcional —</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Precio de Venta ({currencySymbol}) *
              </label>
              <input
                name="salePrice"
                type="number"
                step="0.01"
                min="0"
                required
                defaultValue="0"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Costo de Referencia ({currencySymbol}) *
              </label>
              <input
                name="referenceCost"
                type="number"
                step="0.01"
                min="0"
                required
                defaultValue="0"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Stock Mínimo</label>
              <input
                name="minimumStock"
                type="number"
                step="1"
                min="0"
                defaultValue="0"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
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
              {isPending ? 'Guardando...' : 'Guardar Producto'}
            </button>
          </div>
        </form>
      )}

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-100 dark:bg-slate-800 text-xs uppercase text-slate-600 dark:text-slate-300">
              <tr>
                <th className="px-4 py-3">SKU</th>
                <th className="px-4 py-3">Nombre</th>
                <th className="px-4 py-3">Categoría</th>
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3">Unidad</th>
                <th className="px-4 py-3 text-right">Precio</th>
                <th className="px-4 py-3 text-right">Costo Ref.</th>
                <th className="px-4 py-3 text-right">Margen Est.</th>
                <th className="px-4 py-3 text-right">Stock Mín.</th>
                <th className="px-4 py-3">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {products.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-slate-500">
                    No hay productos registrados aún. Haz clic en &quot;+ Nuevo Producto / Servicio&quot; para agregar el primero.
                  </td>
                </tr>
              ) : (
                products.map((p) => {
                  const margin =
                    p.salePrice > 0 ? ((p.salePrice - p.referenceCost) / p.salePrice) * 100 : 0;
                  return (
                    <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <td className="px-4 py-3 font-mono font-semibold text-blue-600">{p.sku}</td>
                      <td className="px-4 py-3 font-medium">{p.name}</td>
                      <td className="px-4 py-3">{p.categoryName}</td>
                      <td className="px-4 py-3">
                        {p.type === 'SERVICE' ? 'Servicio' : 'Producto'}
                      </td>
                      <td className="px-4 py-3">{p.unitName}</td>
                      <td className="px-4 py-3 text-right font-mono">
                        {currencySymbol} {p.salePrice.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono">
                        {currencySymbol} {p.referenceCost.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-emerald-600 font-semibold">
                        {margin.toFixed(1)}%
                      </td>
                      <td className="px-4 py-3 text-right font-mono">{p.minimumStock}</td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded-full text-xs bg-emerald-100 text-emerald-800 font-medium">
                          {p.status}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
