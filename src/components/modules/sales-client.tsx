'use client';

import React, { useMemo, useState, useTransition } from 'react';
import {
  createPosSaleAction,
  saveTableDraftAction,
  seedBarCatalogAction,
} from '@/app/(tenant)/[tenantSlug]/actions';
import {
  ThermalReceiptModal,
  type ReceiptLineItem,
  type ThermalReceiptData,
} from '@/components/modules/thermal-receipt-modal';
import {
  isKitchenCategory,
  serializeTableOrderMeta,
  type KitchenOrderStatus,
} from '@/lib/bar-table-meta';

export interface SaleRow {
  id: string;
  saleNumber: string;
  tableName: string | null;
  tableAlias: string | null;
  date: string;
  customerName: string;
  paymentCondition: string;
  paymentStatus: string;
  netSubtotal: number;
  discountTotal: number;
  taxTotal: number;
  grandTotal: number;
  grossProfit: number;
  items: ReceiptLineItem[];
}

export interface OpenTableDraft {
  id: string;
  tableName: string;
  tableAlias: string | null;
  kitchenNote: string;
  kitchenStatus: KitchenOrderStatus;
  customerId: string;
  date: string;
  grandTotal: number;
  items: Array<{
    productId: string;
    quantity: number;
    unitPrice: number;
    discountPercent: number;
    taxProfileId: string;
  }>;
}

export interface PosProductCard {
  id: string;
  sku: string;
  name: string;
  categoryName: string;
  unitName: string;
  type: 'PRODUCT' | 'SERVICE';
  salePrice: number;
  availableStock: number | null;
}

interface CartItem {
  product: PosProductCard;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  taxProfileId: string;
}

const DEFAULT_BAR_TABLES = [
  'Barra / Directo',
  'Mesa 1',
  'Mesa 2',
  'Mesa 3',
  'Mesa 4',
  'Mesa 5',
  'Terraza 1',
  'VIP 1',
];

export function SalesClient({
  tenantSlug,
  tradeName,
  currencySymbol,
  sales,
  openDrafts,
  customers,
  products,
  taxProfiles,
  paymentMethods,
  accounts,
}: {
  tenantSlug: string;
  tradeName: string;
  currencySymbol: string;
  sales: SaleRow[];
  openDrafts: OpenTableDraft[];
  customers: Array<{ id: string; name: string }>;
  products: PosProductCard[];
  taxProfiles: Array<{ id: string; name: string; rate: number }>;
  paymentMethods: Array<{ id: string; name: string }>;
  accounts: Array<{ id: string; name: string }>;
}) {
  const [posOpen, setPosOpen] = useState(true);
  const [customTables, setCustomTables] = useState<string[]>(() => {
    const known = new Set(DEFAULT_BAR_TABLES);
    for (const d of openDrafts) if (d.tableName) known.add(d.tableName);
    for (const s of sales) if (s.tableName) known.add(s.tableName);
    return Array.from(known);
  });
  const [newTableName, setNewTableName] = useState('');
  const [selectedTable, setSelectedTable] = useState('Barra / Directo');
  const [tableAlias, setTableAlias] = useState('');
  const [kitchenNote, setKitchenNote] = useState('');
  const [kitchenStatus, setKitchenStatus] = useState<KitchenOrderStatus>('PENDING');
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerId, setCustomerId] = useState(customers[0]?.id ?? '');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [paymentCondition, setPaymentCondition] = useState<'CASH' | 'CREDIT'>('CASH');
  const [paymentMethodId, setPaymentMethodId] = useState(paymentMethods[0]?.id ?? '');
  const [financialAccountId, setFinancialAccountId] = useState(accounts[0]?.id ?? '');
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);
  const [activeReceipt, setActiveReceipt] = useState<ThermalReceiptData | null>(null);
  const [isPending, startTransition] = useTransition();

  const defaultTaxId = taxProfiles[0]?.id ?? '';

  const categories = useMemo(() => {
    const unique = Array.from(new Set(products.map((p) => p.categoryName)));
    return ['ALL', ...unique];
  }, [products]);

  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return products.filter((p) => {
      const matchesCat = selectedCategory === 'ALL' || p.categoryName === selectedCategory;
      const matchesQuery =
        !q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q);
      return matchesCat && matchesQuery;
    });
  }, [products, searchQuery, selectedCategory]);

  function selectTable(tableName: string) {
    setFeedback(null);
    setSelectedTable(tableName);
    const draft = openDrafts.find((d) => d.tableName === tableName);
    if (draft) {
      setActiveDraftId(draft.id);
      setTableAlias(draft.tableAlias ?? '');
      setKitchenNote(draft.kitchenNote ?? '');
      setKitchenStatus(draft.kitchenStatus ?? 'PENDING');
      setCustomerId(draft.customerId);
      setDate(draft.date);
      const loadedItems: CartItem[] = [];
      for (const line of draft.items) {
        const prod = products.find((p) => p.id === line.productId);
        if (prod) {
          loadedItems.push({
            product: prod,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            discountPercent: line.discountPercent,
            taxProfileId: line.taxProfileId,
          });
        }
      }
      setCart(loadedItems);
    } else {
      setActiveDraftId(null);
      setTableAlias('');
      setKitchenNote('');
      setKitchenStatus('PENDING');
      setCart([]);
    }
  }

  function addToCart(product: PosProductCard) {
    setFeedback(null);
    setCart((prev) => {
      const idx = prev.findIndex((item) => item.product.id === product.id);
      if (idx >= 0) {
        return prev.map((item, i) =>
          i === idx ? { ...item, quantity: item.quantity + 1 } : item,
        );
      }
      return [
        ...prev,
        {
          product,
          quantity: 1,
          unitPrice: product.salePrice,
          discountPercent: 0,
          taxProfileId: defaultTaxId,
        },
      ];
    });
  }

  function updateQty(productId: string, delta: number) {
    setCart((prev) =>
      prev
        .map((item) =>
          item.product.id === productId ? { ...item, quantity: item.quantity + delta } : item,
        )
        .filter((item) => item.quantity > 0),
    );
  }

  function applyHappyHourDiscount(discountPercent: number) {
    setCart((prev) => prev.map((item) => ({ ...item, discountPercent })));
  }

  const totals = useMemo(() => {
    let netSubtotal = 0;
    let taxTotal = 0;
    for (const item of cart) {
      const rate = taxProfiles.find((t) => t.id === item.taxProfileId)?.rate ?? 0;
      const lineNet = item.quantity * item.unitPrice * (1 - item.discountPercent / 100);
      const lineTax = lineNet * rate;
      netSubtotal += lineNet;
      taxTotal += lineTax;
    }
    return {
      netSubtotal,
      taxTotal,
      grandTotal: netSubtotal + taxTotal,
    };
  }, [cart, taxProfiles]);

  function handleSaveDraft() {
    if (selectedTable === 'Barra / Directo') {
      setFeedback({ ok: false, message: 'Selecciona una Mesa (ej. Mesa 1) para dejar la cuenta abierta.' });
      return;
    }
    if (cart.length === 0) {
      setFeedback({ ok: false, message: 'Agrega productos antes de guardar la mesa.' });
      return;
    }
    startTransition(async () => {
      const res = await saveTableDraftAction(tenantSlug, {
        draftSaleId: activeDraftId,
        tableName: selectedTable,
        notes: serializeTableOrderMeta({ alias: tableAlias, kitchenNote, kitchenStatus }),
        customerId,
        date,
        lines: cart.map((c) => ({
          productId: c.product.id,
          quantity: c.quantity,
          unitPrice: c.unitPrice,
          discountPercentage: c.discountPercent / 100,
          taxProfileId: c.taxProfileId,
        })),
      });
      setFeedback(res);
    });
  }

  function handleConfirmPosSale() {
    if (cart.length === 0) {
      setFeedback({ ok: false, message: 'Agrega al menos un producto o promoción al ticket.' });
      return;
    }
    const idempotencyKey = `pos-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    startTransition(async () => {
      const res = await createPosSaleAction(tenantSlug, {
        draftSaleId: activeDraftId,
        tableName: selectedTable === 'Barra / Directo' ? null : selectedTable,
        notes: serializeTableOrderMeta({ alias: tableAlias, kitchenNote, kitchenStatus }),
        customerId,
        date,
        paymentCondition,
        paymentMethodId: paymentCondition === 'CASH' ? paymentMethodId : null,
        financialAccountId: paymentCondition === 'CASH' ? financialAccountId : null,
        idempotencyKey,
        lines: cart.map((c) => ({
          productId: c.product.id,
          quantity: c.quantity,
          unitPrice: c.unitPrice,
          discountPercentage: c.discountPercent / 100,
          taxProfileId: c.taxProfileId,
        })),
      });
      setFeedback(res);
      if (res.ok) {
        const customerName = customers.find((c) => c.id === customerId)?.name ?? 'Cliente Mostrador';
        const discountTotal = cart.reduce(
          (sum, item) => sum + item.quantity * item.unitPrice * (item.discountPercent / 100),
          0,
        );
        setActiveReceipt({
          tradeName,
          currencySymbol,
          saleNumber: res.saleNumber ?? 'TICKET',
          tableName: selectedTable === 'Barra / Directo' ? null : selectedTable,
          tableAlias: tableAlias.trim() || null,
          date,
          customerName,
          paymentCondition,
          netSubtotal: totals.netSubtotal,
          discountTotal,
          taxTotal: totals.taxTotal,
          grandTotal: totals.grandTotal,
          items: cart.map((c) => {
            const rate = taxProfiles.find((t) => t.id === c.taxProfileId)?.rate ?? 0;
            const lineNet = c.quantity * c.unitPrice * (1 - c.discountPercent / 100);
            return {
              sku: c.product.sku,
              name: c.product.name,
              quantity: c.quantity,
              unitPrice: c.unitPrice,
              discountPercent: c.discountPercent,
              lineTotal: lineNet * (1 + rate),
            };
          }),
        });
        setCart([]);
        setActiveDraftId(null);
        setTableAlias('');
        setKitchenNote('');
        setKitchenStatus('PENDING');
        setSelectedTable('Barra / Directo');
      }
    });
  }

  function handleAddTable() {
    const trimmed = newTableName.trim();
    let tableName = trimmed;
    if (!tableName) {
      let n = 1;
      while (customTables.includes(`Mesa ${n}`)) n += 1;
      tableName = `Mesa ${n}`;
    }
    if (!customTables.includes(tableName)) {
      setCustomTables((prev) => [...prev, tableName]);
    }
    setNewTableName('');
    selectTable(tableName);
  }

  function handleSeedBarMenu() {
    startTransition(async () => {
      const res = await seedBarCatalogAction(tenantSlug);
      setFeedback(res);
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            POS Bar y Registro de Ventas
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Atiende mesas, cuentas abiertas, cubetazos, sixpacks, comida y cobros rápidos en un solo lugar.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href={`/${tenantSlug}/kitchen`}
            className="px-3 py-2 rounded-md border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 text-xs font-semibold"
          >
            🍳 Pantalla de Cocina
          </a>
          <button
            type="button"
            disabled={isPending}
            onClick={handleSeedBarMenu}
            className="px-3 py-2 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold"
          >
            🍺 Cargar Menú Base de Bar
          </button>
          <button
            type="button"
            onClick={() => {
              setFeedback(null);
              setPosOpen((prev) => !prev);
            }}
            className="px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold shadow-sm"
          >
            {posOpen ? 'Ver Historial de Ventas' : 'Abrir Punto de Venta (POS)'}
          </button>
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

      {posOpen ? (
        <div className="space-y-4">
          {/* Selector Visual de Mesas y Barra */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div className="text-xs font-semibold uppercase text-slate-500">
                Mesas y Cuentas Abiertas ({openDrafts.length} ocupada(s))
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newTableName}
                  onChange={(e) => setNewTableName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddTable();
                    }
                  }}
                  placeholder="Ej. Mesa 6 o Terraza 2"
                  className="w-40 rounded-md border border-slate-300 px-2.5 py-1 text-xs"
                />
                <button
                  type="button"
                  onClick={handleAddTable}
                  className="px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold"
                >
                  + Agregar Mesa
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {customTables.map((table) => {
                const draft = openDrafts.find((d) => d.tableName === table);
                const isSelected = selectedTable === table;
                return (
                  <button
                    key={table}
                    type="button"
                    onClick={() => selectTable(table)}
                    className={`px-3 py-2 rounded-lg text-xs font-semibold border transition-all ${
                      isSelected
                        ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                        : draft
                          ? 'bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <span>
                      {table}
                      {draft?.tableAlias ? ` (${draft.tableAlias})` : ''}
                    </span>
                    {draft && (
                      <span className="ml-1.5 font-mono">
                        • {currencySymbol} {draft.grandTotal.toFixed(0)}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Izquierda: Menú Visual de Productos, Cubetazos y Comida */}
            <div className="lg:col-span-7 space-y-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm">
              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar cerveza, cubetazo, sixpack, alitas, nachos..."
                  className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </div>

              {/* Botones rápidos de categoría */}
              <div className="flex flex-wrap gap-1.5">
                {categories.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                      selectedCategory === cat
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {cat === 'ALL' ? 'Todo el Menú' : cat}
                  </button>
                ))}
              </div>

              {filteredProducts.length === 0 ? (
                <div className="py-10 text-center text-sm text-slate-500">
                  No hay productos en el catálogo. Haz clic arriba en <strong>&quot;🍺 Cargar Menú Base de Bar&quot;</strong> para empezar al instante.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 max-h-[500px] overflow-y-auto pr-1">
                  {filteredProducts.map((p) => {
                    const outOfStock = p.type === 'PRODUCT' && (p.availableStock ?? 0) <= 0;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => addToCart(p)}
                        className="text-left rounded-lg border border-slate-200 dark:border-slate-700 hover:border-blue-500 hover:bg-blue-50/40 p-3.5 transition-all flex flex-col justify-between gap-2"
                      >
                        <div>
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-[10px] font-mono font-semibold text-blue-600">
                              {p.sku}
                            </span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 truncate max-w-[110px]">
                              {p.categoryName}
                            </span>
                          </div>
                          <div className="mt-1 font-semibold text-sm text-slate-900 dark:text-slate-100 line-clamp-2">
                            {p.name}
                          </div>
                        </div>
                        <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                          <span className="font-mono font-bold text-sm text-emerald-600">
                            {currencySymbol} {p.salePrice.toFixed(2)}
                          </span>
                          <span
                            className={`text-[11px] font-medium ${
                              p.type === 'SERVICE'
                                ? 'text-indigo-600'
                                : outOfStock
                                  ? 'text-rose-600'
                                  : 'text-slate-500'
                            }`}
                          >
                            {p.type === 'SERVICE'
                              ? 'Servicio'
                              : `Stock: ${p.availableStock}`}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Derecha: Ticket / Cuenta de la Mesa */}
            <div className="lg:col-span-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm flex flex-col justify-between space-y-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                  <div>
                    <h2 className="text-base font-bold">{selectedTable}</h2>
                    <span className="text-xs text-slate-500">
                      {activeDraftId ? 'Cuenta abierta guardada' : 'Nuevo pedido'}
                    </span>
                  </div>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => applyHappyHourDiscount(15)}
                      className="px-2 py-1 rounded bg-purple-100 hover:bg-purple-200 text-purple-800 text-[11px] font-semibold"
                    >
                      Happy Hour -15%
                    </button>
                    <button
                      type="button"
                      onClick={() => applyHappyHourDiscount(0)}
                      className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px]"
                    >
                      Sin desc.
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Nombre / Identificador de la Mesa o Cliente
                    </label>
                    <input
                      type="text"
                      value={tableAlias}
                      onChange={(e) => setTableAlias(e.target.value)}
                      placeholder="Ej. Grupo de Carlos, Cumpleaños Ana, Mesa VIP..."
                      className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Notas para Cocina (opcional)
                    </label>
                    <input
                      type="text"
                      value={kitchenNote}
                      onChange={(e) => setKitchenNote(e.target.value)}
                      placeholder="Ej. Sin picante, salsa aparte, bien cocidas..."
                      className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Cliente</label>
                    <select
                      value={customerId}
                      onChange={(e) => setCustomerId(e.target.value)}
                      className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm bg-white"
                    >
                      {customers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Fecha</label>
                    <input
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm"
                    />
                  </div>
                </div>

                <div className="space-y-2 max-h-56 overflow-y-auto">
                  {cart.length === 0 ? (
                    <div className="py-8 text-center text-xs text-slate-400 border border-dashed border-slate-300 rounded-lg">
                      Toca los productos de la izquierda para agregarlos a {selectedTable}.
                    </div>
                  ) : (
                    cart.map((item) => (
                      <div
                        key={item.product.id}
                        className="rounded-lg border border-slate-200 p-2.5 space-y-1.5"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="text-xs font-semibold">
                            {item.product.name}{' '}
                            {item.discountPercent > 0 && (
                              <span className="text-purple-600">(-{item.discountPercent}%)</span>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => updateQty(item.product.id, -item.quantity)}
                            className="text-[11px] text-rose-600 hover:underline"
                          >
                            Quitar
                          </button>
                        </div>
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => updateQty(item.product.id, -1)}
                              className="w-6 h-6 rounded border border-slate-300 font-bold"
                            >
                              -
                            </button>
                            <span className="w-7 text-center font-mono font-semibold">
                              {item.quantity}
                            </span>
                            <button
                              type="button"
                              onClick={() => updateQty(item.product.id, 1)}
                              className="w-6 h-6 rounded border border-slate-300 font-bold"
                            >
                              +
                            </button>
                          </div>
                          <span className="font-mono font-bold">
                            {currencySymbol}{' '}
                            {(
                              item.quantity *
                              item.unitPrice *
                              (1 - item.discountPercent / 100)
                            ).toFixed(2)}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2 border-t border-slate-200">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">Condición</label>
                    <select
                      value={paymentCondition}
                      onChange={(e) => setPaymentCondition(e.target.value === 'CREDIT' ? 'CREDIT' : 'CASH')}
                      className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs bg-white"
                    >
                      <option value="CASH">Contado</option>
                      <option value="CREDIT">Crédito (Fiado)</option>
                    </select>
                  </div>
                  {paymentCondition === 'CASH' && (
                    <>
                      <div>
                        <label className="block text-[11px] font-medium text-slate-600 mb-1">Método</label>
                        <select
                          value={paymentMethodId}
                          onChange={(e) => setPaymentMethodId(e.target.value)}
                          className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs bg-white"
                        >
                          {paymentMethods.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-slate-600 mb-1">Cuenta</label>
                        <select
                          value={financialAccountId}
                          onChange={(e) => setFinancialAccountId(e.target.value)}
                          className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs bg-white"
                        >
                          {accounts.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div className="space-y-3 pt-3 border-t border-slate-200">
                <div className="flex justify-between text-lg font-bold">
                  <span>Total:</span>
                  <span className="font-mono text-blue-600">
                    {currencySymbol} {totals.grandTotal.toFixed(2)}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {selectedTable !== 'Barra / Directo' && (
                    <button
                      type="button"
                      disabled={isPending || cart.length === 0}
                      onClick={handleSaveDraft}
                      className="py-2.5 rounded-lg border border-amber-400 bg-amber-50 hover:bg-amber-100 text-amber-900 font-semibold text-xs disabled:opacity-50"
                    >
                      {cart.some((c) => isKitchenCategory(c.product.categoryName))
                        ? 'Guardar y Enviar a Cocina'
                        : 'Guardar en Mesa'}
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={isPending || cart.length === 0}
                    onClick={handleConfirmPosSale}
                    className={`py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm disabled:opacity-50 ${
                      selectedTable === 'Barra / Directo' ? 'sm:col-span-2' : ''
                    }`}
                  >
                    {isPending ? 'Procesando...' : 'Cobrar y Cerrar'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-100 dark:bg-slate-800 text-xs uppercase text-slate-600 dark:text-slate-300">
                <tr>
                  <th className="px-4 py-3">N.º Venta</th>
                  <th className="px-4 py-3">Mesa</th>
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3">Cliente</th>
                  <th className="px-4 py-3">Condición</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3 text-right">Utilidad</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3 text-right">Ticket</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {sales.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-slate-500">
                      No hay ventas cobradas aún.
                    </td>
                  </tr>
                ) : (
                  sales.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-mono font-semibold text-blue-600">
                        {s.saleNumber}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {s.tableName ?? 'Barra'}
                        {s.tableAlias ? ` (${s.tableAlias})` : ''}
                      </td>
                      <td className="px-4 py-3">{s.date}</td>
                      <td className="px-4 py-3 font-medium">{s.customerName}</td>
                      <td className="px-4 py-3">
                        {s.paymentCondition === 'CASH' ? 'Contado' : 'Crédito'}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-semibold">
                        {currencySymbol} {s.grandTotal.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-emerald-600 font-semibold">
                        {currencySymbol} {s.grossProfit.toFixed(2)}
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded-full text-xs bg-emerald-100 text-emerald-800 font-medium">
                          {s.paymentStatus}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() =>
                            setActiveReceipt({
                              tradeName,
                              currencySymbol,
                              saleNumber: s.saleNumber,
                              tableName: s.tableName,
                              tableAlias: s.tableAlias,
                              date: s.date,
                              customerName: s.customerName,
                              paymentCondition: s.paymentCondition,
                              netSubtotal: s.netSubtotal,
                              discountTotal: s.discountTotal,
                              taxTotal: s.taxTotal,
                              grandTotal: s.grandTotal,
                              items: s.items,
                            })
                          }
                          className="px-2.5 py-1 rounded border border-slate-300 hover:bg-slate-100 text-xs font-semibold"
                        >
                          🖨 Ticket
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeReceipt && (
        <ThermalReceiptModal
          receipt={activeReceipt}
          onClose={() => setActiveReceipt(null)}
        />
      )}
    </div>
  );
}
