'use client';

import React, { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updateKitchenStatusAction } from '@/app/(tenant)/[tenantSlug]/actions';
import type { KitchenOrderStatus } from '@/lib/bar-table-meta';

export interface KitchenOrderCard {
  saleId: string;
  tableName: string;
  tableAlias: string;
  kitchenNote: string;
  kitchenStatus: KitchenOrderStatus;
  updatedAt: string;
  items: Array<{
    sku: string;
    name: string;
    quantity: number;
  }>;
}

export function KitchenClient({
  tenantSlug,
  orders,
}: {
  tenantSlug: string;
  orders: KitchenOrderCard[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [printOrder, setPrintOrder] = useState<KitchenOrderCard | null>(null);
  const [paperWidth, setPaperWidth] = useState<'58mm' | '80mm'>('80mm');

  useEffect(() => {
    const timer = setInterval(() => {
      router.refresh();
    }, 15000);
    return () => clearInterval(timer);
  }, [router]);

  function changeStatus(saleId: string, status: KitchenOrderStatus) {
    startTransition(async () => {
      await updateKitchenStatusAction(tenantSlug, saleId, status);
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            Cocina — Comandas Activas ({orders.length})
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Muestra únicamente los platillos de comida y bocas de las mesas abiertas. Se actualiza automáticamente cada 15 segundos.
          </p>
        </div>
        <button
          type="button"
          onClick={() => router.refresh()}
          className="px-4 py-2 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold"
        >
          ↻ Actualizar Comandas
        </button>
      </div>

      {orders.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center text-slate-500">
          No hay comandas de cocina pendientes en este momento.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {orders.map((order) => (
            <div
              key={order.saleId}
              className={`rounded-xl border-2 bg-white dark:bg-slate-900 p-5 shadow-sm flex flex-col justify-between space-y-4 ${
                order.kitchenStatus === 'READY'
                  ? 'border-emerald-400'
                  : order.kitchenStatus === 'PREPARING'
                    ? 'border-amber-400'
                    : 'border-rose-400'
              }`}
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2 border-b border-slate-200 pb-2.5">
                  <div>
                    <div className="text-lg font-bold text-slate-900 dark:text-slate-100">
                      {order.tableName}
                      {order.tableAlias ? ` (${order.tableAlias})` : ''}
                    </div>
                    <div className="text-xs text-slate-500 font-mono">Hora: {order.updatedAt}</div>
                  </div>
                  <span
                    className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                      order.kitchenStatus === 'READY'
                        ? 'bg-emerald-100 text-emerald-800'
                        : order.kitchenStatus === 'PREPARING'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-rose-100 text-rose-800'
                    }`}
                  >
                    {order.kitchenStatus === 'READY'
                      ? 'LISTO'
                      : order.kitchenStatus === 'PREPARING'
                        ? 'PREPARANDO'
                        : 'PENDIENTE'}
                  </span>
                </div>

                {order.kitchenNote && (
                  <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-900 font-medium">
                    📝 Nota: {order.kitchenNote}
                  </div>
                )}

                <ul className="space-y-2">
                  {order.items.map((item, idx) => (
                    <li
                      key={`${item.sku}-${idx}`}
                      className="flex items-center justify-between text-sm font-semibold border-b border-dotted border-slate-200 pb-1.5"
                    >
                      <span>{item.name}</span>
                      <span className="px-2 py-0.5 rounded bg-slate-900 text-white font-mono text-xs">
                        x{item.quantity}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="space-y-2 pt-2">
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => changeStatus(order.saleId, 'PENDING')}
                    className={`py-1.5 rounded text-xs font-semibold border ${
                      order.kitchenStatus === 'PENDING'
                        ? 'bg-rose-600 text-white border-rose-600'
                        : 'bg-white text-slate-700 border-slate-300'
                    }`}
                  >
                    Pendiente
                  </button>
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => changeStatus(order.saleId, 'PREPARING')}
                    className={`py-1.5 rounded text-xs font-semibold border ${
                      order.kitchenStatus === 'PREPARING'
                        ? 'bg-amber-500 text-white border-amber-500'
                        : 'bg-white text-slate-700 border-slate-300'
                    }`}
                  >
                    Preparando
                  </button>
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => changeStatus(order.saleId, 'READY')}
                    className={`py-1.5 rounded text-xs font-semibold border ${
                      order.kitchenStatus === 'READY'
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'bg-white text-slate-700 border-slate-300'
                    }`}
                  >
                    Listo
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setPrintOrder(order)}
                  className="w-full py-1.5 rounded border border-slate-300 hover:bg-slate-50 text-xs font-semibold"
                >
                  🖨 Imprimir Comanda Cocina
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {printOrder && (
        <>
          <style>{`
            @media print {
              body * { visibility: hidden !important; }
              #kitchen-ticket-print, #kitchen-ticket-print * { visibility: visible !important; }
              #kitchen-ticket-print {
                position: absolute !important;
                left: 0 !important;
                top: 0 !important;
                width: ${paperWidth === '58mm' ? '54mm' : '76mm'} !important;
              }
              @page { size: ${paperWidth} auto; margin: 2mm; }
            }
          `}</style>
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div className="w-full max-w-sm rounded-xl bg-white p-4 space-y-4 shadow-xl">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold">Comanda de Cocina</span>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => setPaperWidth('58mm')}
                    className={`px-2 py-1 rounded text-xs font-semibold ${
                      paperWidth === '58mm' ? 'bg-blue-600 text-white' : 'bg-slate-100'
                    }`}
                  >
                    58 mm
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaperWidth('80mm')}
                    className={`px-2 py-1 rounded text-xs font-semibold ${
                      paperWidth === '80mm' ? 'bg-blue-600 text-white' : 'bg-slate-100'
                    }`}
                  >
                    80 mm
                  </button>
                </div>
              </div>

              <div className="flex justify-center bg-slate-100 p-3">
                <div
                  id="kitchen-ticket-print"
                  style={{ width: paperWidth === '58mm' ? '58mm' : '80mm' }}
                  className="bg-white text-black font-mono p-3 border border-slate-300 text-xs space-y-2"
                >
                  <div className="text-center border-b border-dashed border-black pb-1.5">
                    <div className="font-bold text-sm">COMANDA DE COCINA</div>
                    <div className="font-bold">
                      {printOrder.tableName}
                      {printOrder.tableAlias ? ` (${printOrder.tableAlias})` : ''}
                    </div>
                    <div className="text-[10px]">Hora: {printOrder.updatedAt}</div>
                  </div>
                  {printOrder.kitchenNote && (
                    <div className="border-b border-dashed border-black pb-1.5 font-bold text-[11px]">
                      NOTA: {printOrder.kitchenNote}
                    </div>
                  )}
                  <div className="space-y-1">
                    {printOrder.items.map((item, idx) => (
                      <div key={idx} className="font-bold text-sm">
                        {item.quantity} x {item.name}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setPrintOrder(null)}
                  className="px-3 py-1.5 rounded border text-xs font-semibold"
                >
                  Cerrar
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-3 py-1.5 rounded bg-blue-600 text-white text-xs font-semibold"
                >
                  🖨 Imprimir ({paperWidth})
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
