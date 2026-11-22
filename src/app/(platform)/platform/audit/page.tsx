import React from 'react';
import { prisma } from '@/infrastructure/database/prisma-client';
import { PlatformShell } from '@/components/layout/platform-shell';

export const dynamic = 'force-dynamic';

export default async function PlatformAuditPage() {
  const logs = await prisma.auditLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  return (
    <PlatformShell
      title="Auditoría de Plataforma"
      subtitle="Trazabilidad de acciones administrativas, operaciones críticas y conciliaciones"
      activeHref="/platform/audit"
    >
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-6 space-y-4">
        <h2 className="text-lg font-semibold">Bitácora Global (`audit_logs`, últimos {logs.length})</h2>
        {logs.length === 0 ? (
          <p className="text-sm text-slate-400">No hay eventos de auditoría registrados todavía.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs uppercase text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="py-2 pr-4">Fecha</th>
                  <th className="py-2 pr-4">Acción</th>
                  <th className="py-2 pr-4">Entidad</th>
                  <th className="py-2 pr-4">Motivo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {logs.map((l) => (
                  <tr key={l.id}>
                    <td className="py-2 pr-4 font-mono text-xs text-slate-400">
                      {l.createdAt.toISOString().replace('T', ' ').slice(0, 19)}
                    </td>
                    <td className="py-2 pr-4 font-mono text-xs text-indigo-300">{l.action}</td>
                    <td className="py-2 pr-4 text-xs">{l.entityType}</td>
                    <td className="py-2 pr-4 text-xs text-slate-300">{l.reason ?? '—'}</td>
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
