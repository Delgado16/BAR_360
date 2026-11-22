import React from 'react';
import { prisma } from '@/infrastructure/database/prisma-client';
import { ensureTenantWorkspace } from '@/infrastructure/database/tenant-bootstrap';
import { ReceivablesClient } from '@/components/modules/receivables-client';

export const dynamic = 'force-dynamic';

export default async function ReceivablesPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const tenant = await ensureTenantWorkspace(tenantSlug);

  const [receivables, paymentMethods, accounts] = await Promise.all([
    prisma.accountReceivable.findMany({
      where: { tenantId: tenant.id },
      include: { customer: true },
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
    <ReceivablesClient
      tenantSlug={tenantSlug}
      currencySymbol={tenant.settings?.currencySymbol ?? 'C$'}
      receivables={receivables.map((r) => ({
        id: r.id,
        documentNumber: r.documentNumber,
        customerName: r.customer.name,
        issueDate: r.issueDate.toISOString().slice(0, 10),
        dueDate: r.dueDate.toISOString().slice(0, 10),
        originalAmount: Number(r.originalAmount),
        paidAmount: Number(r.paidAmount),
        balanceAmount: Number(r.balanceAmount),
        status: r.status,
      }))}
      paymentMethods={paymentMethods.map((m) => ({ id: m.id, name: m.name }))}
      accounts={accounts.map((a) => ({ id: a.id, name: a.name }))}
    />
  );
}
