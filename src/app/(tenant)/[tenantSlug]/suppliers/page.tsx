import React from 'react';
import { prisma } from '@/infrastructure/database/prisma-client';
import { ensureTenantWorkspace } from '@/infrastructure/database/tenant-bootstrap';
import { SuppliersClient } from '@/components/modules/suppliers-client';

export const dynamic = 'force-dynamic';

export default async function SuppliersDirectoryPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const tenant = await ensureTenantWorkspace(tenantSlug);

  const suppliers = await prisma.supplier.findMany({
    where: { tenantId: tenant.id },
    orderBy: { createdAt: 'desc' },
  });

  return (
    <SuppliersClient
      tenantSlug={tenantSlug}
      suppliers={suppliers.map((s) => ({
        id: s.id,
        code: s.code,
        name: s.name,
        contactName: s.contactName,
        phone: s.phone,
        email: s.email,
        suppliedInfo: s.suppliedInfo,
        status: s.status,
      }))}
    />
  );
}
