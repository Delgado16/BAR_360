import React from 'react';
import { prisma } from '@/infrastructure/database/prisma-client';
import { ensureTenantWorkspace } from '@/infrastructure/database/tenant-bootstrap';
import { ProductsClient } from '@/components/modules/products-client';

export const dynamic = 'force-dynamic';

export default async function ProductsCatalogPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const tenant = await ensureTenantWorkspace(tenantSlug);

  const [products, categories, units, suppliers] = await Promise.all([
    prisma.product.findMany({
      where: { tenantId: tenant.id },
      include: { category: true, unit: true, preferredSupplier: true },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.productCategory.findMany({
      where: { tenantId: tenant.id, status: 'ACTIVE' },
      orderBy: { sortOrder: 'asc' },
    }),
    prisma.unitOfMeasure.findMany({
      where: { tenantId: tenant.id, status: 'ACTIVE' },
      orderBy: { name: 'asc' },
    }),
    prisma.supplier.findMany({
      where: { tenantId: tenant.id, status: 'ACTIVE' },
      orderBy: { name: 'asc' },
    }),
  ]);

  return (
    <ProductsClient
      tenantSlug={tenantSlug}
      currencySymbol={tenant.settings?.currencySymbol ?? 'C$'}
      products={products.map((p) => ({
        id: p.id,
        sku: p.sku,
        name: p.name,
        description: p.description,
        categoryName: p.category.name,
        type: p.type,
        unitName: p.unit.name,
        salePrice: Number(p.salePrice),
        referenceCost: Number(p.referenceCost),
        supplierName: p.preferredSupplier?.name ?? '—',
        minimumStock: Number(p.minimumStock),
        status: p.status,
      }))}
      categories={categories.map((c) => ({ id: c.id, name: c.name }))}
      units={units.map((u) => ({ id: u.id, name: u.name }))}
      suppliers={suppliers.map((s) => ({ id: s.id, name: s.name }))}
    />
  );
}
