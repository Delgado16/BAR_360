'use client';

import React, { useState } from 'react';
import { simulatePricing } from '@/domain/calculations/financial-engine';

export function PricingSimulatorClient({
  currencySymbol,
  products,
}: {
  currencySymbol: string;
  products: Array<{ id: string; sku: string; name: string; cost: number; price: number }>;
}) {
  const first = products[0];
  const [cost, setCost] = useState<number>(first?.cost ?? 80);
  const [price, setPrice] = useState<number>(first?.price ?? 100);
  const [targetMargin, setTargetMargin] = useState<number>(30);
  const [discountPct, setDiscountPct] = useState<number>(5);
  const [taxPct, setTaxPct] = useState<number>(15);
  const [volume, setVolume] = useState<number>(100);
  const [fixedCosts, setFixedCosts] = useState<number>(500);

  const result = simulatePricing({
    catalogCost: cost,
    catalogPrice: price,
    targetMargin: Math.min(0.95, Math.max(0, targetMargin / 100)),
    discountRate: Math.min(0.99, Math.max(0, discountPct / 100)),
    taxRate: Math.max(0, taxPct / 100),
    baseMonthlyVolume: Math.max(0, volume),
    monthlyFixedCosts: Math.max(0, fixedCosts),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
          Simulador de Precios y Márgenes
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Simula escenarios sin modificar el catálogo real de PostgreSQL.
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm space-y-4">
        {products.length > 0 && (
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Cargar datos desde producto del catálogo
            </label>
            <select
              onChange={(e) => {
                const p = products.find((x) => x.id === e.target.value);
                if (p) {
                  setCost(p.cost);
                  setPrice(p.price);
                }
              }}
              className="w-full md:w-96 rounded-md border border-slate-300 px-3 py-2 text-sm bg-white"
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.sku} — {p.name} (Costo: {currencySymbol} {p.cost.toFixed(2)}, Precio: {currencySymbol} {p.price.toFixed(2)})
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Costo Unitario ({currencySymbol})</label>
            <input type="number" step="0.01" value={cost} onChange={(e) => setCost(Number(e.target.value))} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Precio Actual ({currencySymbol})</label>
            <input type="number" step="0.01" value={price} onChange={(e) => setPrice(Number(e.target.value))} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Margen Objetivo (%)</label>
            <input type="number" step="1" value={targetMargin} onChange={(e) => setTargetMargin(Number(e.target.value))} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Descuento (%)</label>
            <input type="number" step="1" value={discountPct} onChange={(e) => setDiscountPct(Number(e.target.value))} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Impuesto (%)</label>
            <input type="number" step="1" value={taxPct} onChange={(e) => setTaxPct(Number(e.target.value))} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Volumen Mensual (u.)</label>
            <input type="number" step="1" value={volume} onChange={(e) => setVolume(Number(e.target.value))} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Costos Fijos ({currencySymbol})</label>
            <input type="number" step="10" value={fixedCosts} onChange={(e) => setFixedCosts(Number(e.target.value))} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="text-xs font-semibold uppercase text-slate-500">Margen Actual s/Ventas</div>
          <div className="mt-1 text-2xl font-bold font-mono">{(result.currentMarginOnSales * 100).toFixed(2)}%</div>
          <div className="text-xs text-slate-500">Recargo s/costo: {(result.currentMarkupOnCost * 100).toFixed(2)}%</div>
        </div>
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
          <div className="text-xs font-semibold uppercase text-blue-700">Precio Recomendado (s/imp.)</div>
          <div className="mt-1 text-2xl font-bold font-mono text-blue-800">{currencySymbol} {result.recommendedPriceNoTax.toFixed(2)}</div>
          <div className="text-xs text-blue-700">Con impuesto: {currencySymbol} {result.recommendedPriceWithTax.toFixed(2)}</div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="text-xs font-semibold uppercase text-slate-500">Utilidad Unitaria Actual</div>
          <div className="mt-1 text-2xl font-bold font-mono text-emerald-600">{currencySymbol} {result.unitProfitCurrent.toFixed(2)}</div>
          <div className="text-xs text-slate-500">Con precio recom.: {currencySymbol} {result.unitProfitRecommended.toFixed(2)}</div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="text-xs font-semibold uppercase text-slate-500">Punto de Equilibrio</div>
          <div className="mt-1 text-2xl font-bold font-mono">{Math.ceil(result.breakEvenUnitsCurrent)} u.</div>
          <div className="text-xs text-slate-500">{result.diagnostic}</div>
        </div>
      </div>
    </div>
  );
}
