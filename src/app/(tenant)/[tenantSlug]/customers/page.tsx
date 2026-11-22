import React from 'react';
import { prisma } from '@/infrastructure/database/prisma-client';
import { ensureTenantWorkspace } from '@/infrastructure/database/tenant-bootstrap';
import { CustomersClient } from '@/components/modules/customers-client';

export const dynamic = 'force-dynamic';

export default async function CustomersDirectoryPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const tenant = await ensureTenantWorkspace(tenantSlug);

  const customers = await prisma.customer.findMany({
    where: { tenantId: tenant.id },
    orderBy: { createdAt: 'desc' },
  });

  return (
    <CustomersClient
      tenantSlug={tenantSlug}
      customers={customers.map((c) => ({
        id: c.id,
        code: c.code,
        name: c.name,
        phone: c.phone,
        email: c.email,
        customerType: c.customerType,
        creditDays: c.creditDays,
        status: c.status,
      }))}
    />
  );
}
