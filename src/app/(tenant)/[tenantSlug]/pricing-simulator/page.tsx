import React from 'react';
import { prisma } from '@/infrastructure/database/prisma-client';
import { ensureTenantWorkspace } from '@/infrastructure/database/tenant-bootstrap';
import { PricingSimulatorClient } from '@/components/modules/pricing-simulator-client';

export const dynamic = 'force-dynamic';

export default async function PricingSimulatorPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const tenant = await ensureTenantWorkspace(tenantSlug);

  const products = await prisma.product.findMany({
    where: { tenantId: tenant.id, status: 'ACTIVE' },
    orderBy: { sku: 'asc' },
  });

  return (
    <PricingSimulatorClient
      currencySymbol={tenant.settings?.currencySymbol ?? 'C$'}
      products={products.map((p) => ({
        id: p.id,
        sku: p.sku,
        name: p.name,
        cost: Number(p.referenceCost),
        price: Number(p.salePrice),
      }))}
    />
  );
}
