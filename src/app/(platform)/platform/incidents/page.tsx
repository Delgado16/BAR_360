import React from 'react';
import { prisma } from '@/infrastructure/database/prisma-client';
import { PlatformShell } from '@/components/layout/platform-shell';
import { PlatformIncidentsClient } from '@/components/modules/platform-incidents-client';

export const dynamic = 'force-dynamic';

export default async function PlatformIncidentsPage() {
  const [tenants, incidents] = await Promise.all([
    prisma.tenant.findMany({ orderBy: { tradeName: 'asc' } }),
    prisma.auditLog.findMany({
      where: { action: 'SUPPORT_INCIDENT_LOGGED' },
      include: { tenant: true },
      orderBy: { createdAt: 'desc' },
      take: 30,
    }),
  ]);

  return (
    <PlatformShell
      title="Gestión de Incidencias"
      subtitle="Tickets de soporte y registro de accesos excepcionales auditados"
      activeHref="/platform/incidents"
    >
      <PlatformIncidentsClient
        tenants={tenants.map((t) => ({ id: t.id, tradeName: t.tradeName }))}
        incidents={incidents.map((i) => ({
          id: i.id,
          createdAt: i.createdAt.toISOString().replace('T', ' ').slice(0, 19),
          tenantName: i.tenant?.tradeName ?? 'Plataforma Global',
          reason: i.reason ?? '—',
        }))}
      />
    </PlatformShell>
  );
}
