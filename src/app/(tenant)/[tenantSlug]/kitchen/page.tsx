import React from 'react';
import { prisma } from '@/infrastructure/database/prisma-client';
import { ensureTenantWorkspace } from '@/infrastructure/database/tenant-bootstrap';
import { isKitchenCategory, parseTableOrderMeta } from '@/lib/bar-table-meta';
import { KitchenClient, type KitchenOrderCard } from '@/components/modules/kitchen-client';

export const dynamic = 'force-dynamic';

export default async function KitchenPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const tenant = await ensureTenantWorkspace(tenantSlug);

  const drafts = await prisma.sale.findMany({
    where: { tenantId: tenant.id, status: 'DRAFT' },
    include: {
      items: {
        include: {
          product: {
            include: { category: true },
          },
        },
      },
    },
    orderBy: { updatedAt: 'asc' },
  });

  const orders: KitchenOrderCard[] = [];
  for (const d of drafts) {
    const kitchenItems = d.items.filter((i) => isKitchenCategory(i.product.category.name));
    if (kitchenItems.length === 0) continue;

    const meta = parseTableOrderMeta(d.notes);
    orders.push({
      saleId: d.id,
      tableName: d.documentNumber ?? d.saleNumber,
      tableAlias: meta.alias,
      kitchenNote: meta.kitchenNote,
      kitchenStatus: meta.kitchenStatus,
      updatedAt: d.updatedAt.toISOString().slice(11, 16),
      items: kitchenItems.map((i) => ({
        sku: i.product.sku,
        name: i.product.name,
        quantity: Number(i.quantity),
      })),
    });
  }

  return <KitchenClient tenantSlug={tenantSlug} orders={orders} />;
}
