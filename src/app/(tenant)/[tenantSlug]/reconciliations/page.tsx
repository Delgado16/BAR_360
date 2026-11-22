import React from 'react';
import { prisma } from '@/infrastructure/database/prisma-client';
import { ensureTenantWorkspace } from '@/infrastructure/database/tenant-bootstrap';
import { ReconciliationsClient, type ControlRow } from '@/components/modules/reconciliations-client';

export const dynamic = 'force-dynamic';

export default async function ReconciliationsPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const tenant = await ensureTenantWorkspace(tenantSlug);

  const lastRun = await prisma.financialReconciliation.findFirst({
    where: { tenantId: tenant.id },
    orderBy: { executedAt: 'desc' },
  });

  const controls = Array.isArray(lastRun?.resultsJson)
    ? (lastRun.resultsJson as unknown as ControlRow[])
    : [];

  return (
    <ReconciliationsClient
      tenantSlug={tenantSlug}
      currencySymbol={tenant.settings?.currencySymbol ?? 'C$'}
      lastRunAt={lastRun ? lastRun.executedAt.toISOString().replace('T', ' ').slice(0, 19) : null}
      okCount={lastRun?.okCount ?? 0}
      reviewCount={lastRun?.reviewCount ?? 0}
      alertCount={lastRun?.alertCount ?? 0}
      controls={controls}
    />
  );
}
