import React from 'react';
import { prisma } from '@/infrastructure/database/prisma-client';
import { ensureTenantWorkspace } from '@/infrastructure/database/tenant-bootstrap';
import { PayablesClient } from '@/components/modules/payables-client';

export const dynamic = 'force-dynamic';

export default async function PayablesPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const tenant = await ensureTenantWorkspace(tenantSlug);

  const [payables, paymentMethods, accounts] = await Promise.all([
    prisma.accountPayable.findMany({
      where: { tenantId: tenant.id },
      orderBy: { dueDate: 'asc' },
    }),
    prisma.paymentMethod.findMany({
      where: { tenantId: tenant.id, status: 'ACTIVE' },
      orderBy: { sortOrder: 'asc' },
    }),
    prisma.financialAccount.findMany({
      where: { tenantId: tenant.id, status: 'ACTIVE' },
      orderBy: { name: 'asc' },
    }),
  ]);

  return (
    <PayablesClient
      tenantSlug={tenantSlug}
      currencySymbol={tenant.settings?.currencySymbol ?? 'C$'}
      payables={payables.map((p) => ({
        id: p.id,
        documentNumber: p.documentNumber,
        creditorName: p.creditorName,
        sourceType: p.sourceType,
        issueDate: p.issueDate.toISOString().slice(0, 10),
        dueDate: p.dueDate.toISOString().slice(0, 10),
        originalAmount: Number(p.originalAmount),
        paidAmount: Number(p.paidAmount),
        balanceAmount: Number(p.balanceAmount),
        status: p.status,
      }))}
      paymentMethods={paymentMethods.map((m) => ({ id: m.id, name: m.name }))}
      accounts={accounts.map((a) => ({ id: a.id, name: a.name }))}
    />
  );
}
