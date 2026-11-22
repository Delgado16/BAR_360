import React from 'react';
import { prisma } from '@/infrastructure/database/prisma-client';
import { ensureTenantWorkspace } from '@/infrastructure/database/tenant-bootstrap';
import { PurchasesClient } from '@/components/modules/purchases-client';

export const dynamic = 'force-dynamic';

export default async function PurchasesPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const tenant = await ensureTenantWorkspace(tenantSlug);

  const [purchases, suppliers, products, taxProfiles, accounts] = await Promise.all([
    prisma.purchase.findMany({
      where: { tenantId: tenant.id },
      include: { supplier: true },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.supplier.findMany({
      where: { tenantId: tenant.id, status: 'ACTIVE' },
      orderBy: { name: 'asc' },
    }),
    prisma.product.findMany({
      where: { tenantId: tenant.id, status: 'ACTIVE', type: 'PRODUCT' },
      orderBy: { name: 'asc' },
    }),
    prisma.taxProfile.findMany({
      where: { tenantId: tenant.id, status: 'ACTIVE' },
      orderBy: { rate: 'asc' },
    }),
    prisma.financialAccount.findMany({
      where: { tenantId: tenant.id, status: 'ACTIVE' },
      orderBy: { name: 'asc' },
    }),
  ]);

  return (
    <PurchasesClient
      tenantSlug={tenantSlug}
      currencySymbol={tenant.settings?.currencySymbol ?? 'C$'}
      purchases={purchases.map((p) => ({
        id: p.id,
        purchaseNumber: p.purchaseNumber,
        date: p.date.toISOString().slice(0, 10),
        supplierName: p.supplier.name,
        paymentCondition: p.paymentCondition,
        paymentStatus: p.paymentStatus,
        netSubtotal: Number(p.netSubtotal),
        taxTotal: Number(p.taxTotal),
        grandTotal: Number(p.grandTotal),
      }))}
      suppliers={suppliers.map((s) => ({ id: s.id, name: s.name }))}
      products={products.map((p) => ({
        id: p.id,
        sku: p.sku,
        name: p.name,
        referenceCost: Number(p.referenceCost),
      }))}
      taxProfiles={taxProfiles.map((t) => ({
        id: t.id,
        name: t.name,
        rate: Number(t.rate),
      }))}
      accounts={accounts.map((a) => ({ id: a.id, name: a.name }))}
    />
  );
}
