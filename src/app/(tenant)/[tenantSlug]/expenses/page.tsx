import React from 'react';
import { prisma } from '@/infrastructure/database/prisma-client';
import { ensureTenantWorkspace } from '@/infrastructure/database/tenant-bootstrap';
import { ExpensesClient } from '@/components/modules/expenses-client';

export const dynamic = 'force-dynamic';

export default async function ExpensesPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const tenant = await ensureTenantWorkspace(tenantSlug);

  const [expenses, categories, taxProfiles, paymentMethods, accounts] = await Promise.all([
    prisma.operatingExpense.findMany({
      where: { tenantId: tenant.id },
      include: { category: true },
      orderBy: { date: 'desc' },
    }),
    prisma.expenseCategory.findMany({
      where: { tenantId: tenant.id, status: 'ACTIVE' },
      orderBy: { sortOrder: 'asc' },
    }),
    prisma.taxProfile.findMany({
      where: { tenantId: tenant.id, status: 'ACTIVE' },
      orderBy: { rate: 'asc' },
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
    <ExpensesClient
      tenantSlug={tenantSlug}
      currencySymbol={tenant.settings?.currencySymbol ?? 'C$'}
      expenses={expenses.map((e) => ({
        id: e.id,
        expenseNumber: e.expenseNumber,
        date: e.date.toISOString().slice(0, 10),
        categoryName: e.category.name,
        description: e.description,
        netAmount: Number(e.netAmount),
        taxAmount: Number(e.taxAmount),
        totalAmount: Number(e.totalAmount),
        paymentCondition: e.paymentCondition,
        paymentStatus: e.paymentStatus,
      }))}
      categories={categories.map((c) => ({ id: c.id, name: c.name }))}
      taxProfiles={taxProfiles.map((t) => ({ id: t.id, name: t.name, rate: Number(t.rate) }))}
      paymentMethods={paymentMethods.map((m) => ({ id: m.id, name: m.name }))}
      accounts={accounts.map((a) => ({ id: a.id, name: a.name }))}
    />
  );
}
