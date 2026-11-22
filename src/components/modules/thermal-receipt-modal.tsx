'use client';

import React, { useState } from 'react';

export interface ReceiptLineItem {
  sku: string;
  name: string;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  lineTotal: number;
}

export interface ThermalReceiptData {
  tradeName: string;
  currencySymbol: string;
  saleNumber: string;
  tableName: string | null;
  tableAlias?: string | null;
  date: string;
  customerName: string;
  paymentCondition: string;
  netSubtotal: number;
  discountTotal: number;
  taxTotal: number;
  grandTotal: number;
  items: ReceiptLineItem[];
}

export function ThermalReceiptModal({
  receipt,
  onClose,
}: {
  receipt: ThermalReceiptData;
  onClose: () => void;
}) {
  const [paperWidth, setPaperWidth] = useState<'58mm' | '80mm'>('80mm');

  function handlePrint() {
    window.print();
  }

  return (
    <>
      <style>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          #thermal-receipt-print-area,
          #thermal-receipt-print-area * {
            visibility: visible !important;
          }
          #thermal-receipt-print-area {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: ${paperWidth === '58mm' ? '54mm' : '76mm'} !important;
            margin: 0 !important;
            padding: 2mm !important;
            box-shadow: none !important;
            border: none !important;
          }
          @page {
            size: ${paperWidth} auto;
            margin: 2mm;
          }
        }
      `}</style>

      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
        <div className="w-full max-w-md rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-800">
            <div className="text-sm font-bold">Ticket de Venta Térmico</div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setPaperWidth('58mm')}
                className={`px-2.5 py-1 rounded text-xs font-semibold ${
                  paperWidth === '58mm'
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 text-slate-700'
                }`}
              >
                58 mm
              </button>
              <button
                type="button"
                onClick={() => setPaperWidth('80mm')}
                className={`px-2.5 py-1 rounded text-xs font-semibold ${
                  paperWidth === '80mm'
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 text-slate-700'
                }`}
              >
                80 mm
              </button>
            </div>
          </div>

          <div className="p-4 overflow-y-auto bg-slate-100 dark:bg-slate-950 flex justify-center">
            <div
              id="thermal-receipt-print-area"
              style={{ width: paperWidth === '58mm' ? '58mm' : '80mm' }}
              className="bg-white text-black font-mono p-3 shadow-sm border border-slate-300 text-[11px] leading-snug"
            >
              <div className="text-center border-b border-dashed border-black pb-2 mb-2">
                <div className="font-bold text-sm uppercase">{receipt.tradeName}</div>
                <div>Ticket: {receipt.saleNumber}</div>
                <div>Fecha: {receipt.date}</div>
                {receipt.tableName && (
                  <div>
                    Mesa: {receipt.tableName}
                    {receipt.tableAlias ? ` (${receipt.tableAlias})` : ''}
                  </div>
                )}
                <div>Cliente: {receipt.customerName}</div>
                <div>
                  Condición: {receipt.paymentCondition === 'CASH' ? 'Contado' : 'Crédito'}
                </div>
              </div>

              <div className="border-b border-dashed border-black pb-2 mb-2 space-y-1.5">
                <div className="flex justify-between font-bold text-[10px] border-b border-dotted border-black pb-0.5">
                  <span>CANT / DESCRIPCIÓN</span>
                  <span>TOTAL</span>
                </div>
                {receipt.items.map((item, idx) => (
                  <div key={`${item.sku}-${idx}`}>
                    <div className="font-semibold">
                      {item.quantity} x {item.name}
                    </div>
                    <div className="flex justify-between text-[10px]">
                      <span>
                        @ {receipt.currencySymbol} {item.unitPrice.toFixed(2)}
                        {item.discountPercent > 0 ? ` (-${item.discountPercent.toFixed(0)}%)` : ''}
                      </span>
                      <span className="font-semibold">
                        {receipt.currencySymbol} {item.lineTotal.toFixed(2)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="space-y-0.5 text-[11px]">
                <div className="flex justify-between">
                  <span>Subtotal:</span>
                  <span>
                    {receipt.currencySymbol} {receipt.netSubtotal.toFixed(2)}
                  </span>
                </div>
                {receipt.discountTotal > 0 && (
                  <div className="flex justify-between">
                    <span>Descuento:</span>
                    <span>
                      -{receipt.currencySymbol} {receipt.discountTotal.toFixed(2)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>Impuesto:</span>
                  <span>
                    {receipt.currencySymbol} {receipt.taxTotal.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between font-bold text-sm border-t border-dashed border-black pt-1 mt-1">
                  <span>TOTAL:</span>
                  <span>
                    {receipt.currencySymbol} {receipt.grandTotal.toFixed(2)}
                  </span>
                </div>
              </div>

              <div className="text-center border-t border-dashed border-black pt-2 mt-3 text-[10px]">
                <div>¡Gracias por su preferencia!</div>
                <div>MI NEGOCIO PRO 360</div>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 px-4 py-3 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-md border border-slate-300 text-xs font-semibold"
            >
              Cerrar
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold"
            >
              🖨 Imprimir Ticket ({paperWidth})
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
