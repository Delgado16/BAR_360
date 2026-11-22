import React from 'react';
import { prisma } from '@/infrastructure/database/prisma-client';
import { ensureTenantWorkspace } from '@/infrastructure/database/tenant-bootstrap';
import { parseTableOrderMeta } from '@/lib/bar-table-meta';
import { SalesClient } from '@/components/modules/sales-client';

export const dynamic = 'force-dynamic';

export default async function SalesAndPosPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const tenant = await ensureTenantWorkspace(tenantSlug);
  const year = tenant.settings?.operatingYear ?? 2026;
  const month = tenant.settings?.analysisMonth ?? 11;

  const [sales, openDrafts, customers, products, monthlyCosts, taxProfiles, paymentMethods, accounts] =
    await Promise.all([
      prisma.sale.findMany({
        where: { tenantId: tenant.id, status: { not: 'DRAFT' } },
        include: {
          customer: true,
          items: { include: { product: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.sale.findMany({
        where: { tenantId: tenant.id, status: 'DRAFT' },
        include: { items: true },
        orderBy: { updatedAt: 'desc' },
      }),
      prisma.customer.findMany({
        where: { tenantId: tenant.id, status: 'ACTIVE' },
        orderBy: { name: 'asc' },
      }),
      prisma.product.findMany({
        where: { tenantId: tenant.id, status: 'ACTIVE' },
        include: { category: true, unit: true },
        orderBy: { name: 'asc' },
      }),
      prisma.inventoryMonthlyCost.findMany({
        where: { tenantId: tenant.id, year, month },
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

  const stockMap = new Map(monthlyCosts.map((c) => [c.productId, Number(c.closingQuantity)]));

  return (
    <SalesClient
      tenantSlug={tenantSlug}
      tradeName={tenant.tradeName}
      currencySymbol={tenant.settings?.currencySymbol ?? 'C$'}
      sales={sales.map((s) => {
        const meta = parseTableOrderMeta(s.notes);
        return {
          id: s.id,
          saleNumber: s.saleNumber,
          tableName: s.documentNumber,
          tableAlias: meta.alias || null,
          date: s.date.toISOString().slice(0, 10),
          customerName: s.customer.name,
          paymentCondition: s.paymentCondition,
          paymentStatus: s.paymentStatus,
          netSubtotal: Number(s.netSubtotal),
          discountTotal: Number(s.discountTotal),
          taxTotal: Number(s.taxTotal),
          grandTotal: Number(s.grandTotal),
          grossProfit: Number(s.grossProfit),
          items: s.items.map((i) => ({
            sku: i.product.sku,
            name: i.product.name,
            quantity: Number(i.quantity),
            unitPrice: Number(i.unitPrice),
            discountPercent: Number(i.discountPercentage) * 100,
            lineTotal: Number(i.lineTotal),
          })),
        };
      })}
      openDrafts={openDrafts.map((d) => {
        const meta = parseTableOrderMeta(d.notes);
        return {
          id: d.id,
          tableName: d.documentNumber ?? d.saleNumber,
          tableAlias: meta.alias || null,
          kitchenNote: meta.kitchenNote || '',
          kitchenStatus: meta.kitchenStatus,
          customerId: d.customerId,
          date: d.date.toISOString().slice(0, 10),
          grandTotal: Number(d.grandTotal),
          items: d.items.map((i) => ({
            productId: i.productId,
            quantity: Number(i.quantity),
            unitPrice: Number(i.unitPrice),
            discountPercent: Number(i.discountPercentage) * 100,
            taxProfileId: i.taxProfileId,
          })),
        };
      })}
      customers={customers.map((c) => ({ id: c.id, name: c.name }))}
      products={products.map((p) => ({
        id: p.id,
        sku: p.sku,
        name: p.name,
        categoryName: p.category.name,
        unitName: p.unit.name,
        type: p.type,
        salePrice: Number(p.salePrice),
        availableStock: p.type === 'SERVICE' ? null : (stockMap.get(p.id) ?? 0),
      }))}
      taxProfiles={taxProfiles.map((t) => ({
        id: t.id,
        name: t.name,
        rate: Number(t.rate),
      }))}
      paymentMethods={paymentMethods.map((m) => ({ id: m.id, name: m.name }))}
      accounts={accounts.map((a) => ({ id: a.id, name: a.name }))}
    />
  );
}
