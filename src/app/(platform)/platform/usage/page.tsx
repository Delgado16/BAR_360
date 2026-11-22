import React from 'react';
import { prisma } from '@/infrastructure/database/prisma-client';
import { PlatformShell } from '@/components/layout/platform-shell';

export const dynamic = 'force-dynamic';

export default async function PlatformUsagePage() {
  const tenants = await prisma.tenant.findMany({
    include: {
      _count: {
        select: {
          memberships: true,
          products: true,
          sales: true,
        },
      },
    },
    orderBy: { tradeName: 'asc' },
  });

  return (
    <PlatformShell
      title="Uso de Recursos"
      subtitle="Métricas operativas agregadas por empresa sin exponer datos financieros privados"
      activeHref="/platform/usage"
    >
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-6 overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="text-xs uppercase text-slate-400 border-b border-slate-800">
            <tr>
              <th className="py-2 pr-4">Empresa</th>
              <th className="py-2 pr-4">Slug</th>
              <th className="py-2 pr-4 text-right">Usuarios</th>
              <th className="py-2 pr-4 text-right">Productos</th>
              <th className="py-2 pr-4 text-right">Ventas Reg.</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {tenants.map((t) => (
              <tr key={t.id}>
                <td className="py-2.5 pr-4 font-medium text-white">{t.tradeName}</td>
                <td className="py-2.5 pr-4 font-mono text-xs text-slate-400">{t.slug}</td>
                <td className="py-2.5 pr-4 text-right font-mono">{t._count.memberships}</td>
                <td className="py-2.5 pr-4 text-right font-mono">{t._count.products}</td>
                <td className="py-2.5 pr-4 text-right font-mono">{t._count.sales}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PlatformShell>
  );
}
