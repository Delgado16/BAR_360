import React from 'react';
import { prisma } from '@/infrastructure/database/prisma-client';
import { ensureTenantWorkspace } from '@/infrastructure/database/tenant-bootstrap';
import { MovementsClient } from '@/components/modules/movements-client';

export const dynamic = 'force-dynamic';

export default async function MovementsPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const tenant = await ensureTenantWorkspace(tenantSlug);

  const [accounts, movements] = await Promise.all([
    prisma.financialAccount.findMany({
      where: { tenantId: tenant.id, status: 'ACTIVE' },
      orderBy: { name: 'asc' },
    }),
    prisma.cashMovement.findMany({
      where: { tenantId: tenant.id },
      include: { financialAccount: true },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      take: 50,
    }),
  ]);

  return (
    <MovementsClient
      tenantSlug={tenantSlug}
      currencySymbol={tenant.settings?.currencySymbol ?? 'C$'}
      accounts={accounts.map((a) => ({ id: a.id, name: a.name }))}
      movements={movements.map((m) => ({
        id: m.id,
        date: m.date.toISOString().slice(0, 10),
        accountName: m.financialAccount.name,
        direction: m.direction,
        category: m.category,
        amount: Number(m.amount),
        description: m.description,
      }))}
    />
  );
}
