import React from 'react';
import { prisma } from '@/infrastructure/database/prisma-client';
import { PlatformShell } from '@/components/layout/platform-shell';
import { PlatformTenantsClient } from '@/components/modules/platform-tenants-client';

export const dynamic = 'force-dynamic';

export default async function PlatformTenantsPage() {
  const tenants = await prisma.tenant.findMany({
    include: { settings: true },
    orderBy: { createdAt: 'desc' },
  });

  return (
    <PlatformShell
      title="Empresas Registradas (Tenants)"
      subtitle="Crea negocios, activa o suspende empresas y accede de forma aislada"
      activeHref="/platform/tenants"
    >
      <PlatformTenantsClient
        tenants={tenants.map((t) => ({
          id: t.id,
          slug: t.slug,
          tradeName: t.tradeName,
          currencyCode: t.settings?.currencyCode ?? 'NIO',
          status: t.status,
        }))}
      />
    </PlatformShell>
  );
}
