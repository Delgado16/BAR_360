import React from 'react';
import { prisma } from '@/infrastructure/database/prisma-client';
import { PlatformShell } from '@/components/layout/platform-shell';

export const dynamic = 'force-dynamic';

export default async function PlatformPaymentsPage() {
  const events = await prisma.paymentProviderEvent.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  return (
    <PlatformShell
      title="Pagos y Webhooks"
      subtitle="Registro real de eventos recibidos en /api/webhooks/billing"
      activeHref="/platform/payments"
    >
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-6 space-y-4">
        <h2 className="text-lg font-semibold">Eventos de Facturación ({events.length})</h2>
        {events.length === 0 ? (
          <p className="text-sm text-slate-400">
            No se han recibido webhooks de pasarela todavía.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs uppercase text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="py-2 pr-4">Fecha</th>
                  <th className="py-2 pr-4">ID Externo</th>
                  <th className="py-2 pr-4">Tipo</th>
                  <th className="py-2 pr-4">Firma Válida</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {events.map((ev) => (
                  <tr key={ev.id}>
                    <td className="py-2 pr-4 font-mono text-xs text-slate-400">
                      {ev.createdAt.toISOString().replace('T', ' ').slice(0, 19)}
                    </td>
                    <td className="py-2 pr-4 font-mono text-xs">{ev.externalEventId}</td>
                    <td className="py-2 pr-4 text-xs">{ev.eventType}</td>
                    <td className="py-2 pr-4 text-xs">
                      {ev.signatureValid ? '✔ Válida' : '✖ Inválida'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </PlatformShell>
  );
}
