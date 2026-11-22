import React from 'react';
import { prisma } from '@/infrastructure/database/prisma-client';
import { ensureTenantWorkspace } from '@/infrastructure/database/tenant-bootstrap';
import { UsersClient } from '@/components/modules/users-client';

export const dynamic = 'force-dynamic';

export default async function TenantUsersPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const tenant = await ensureTenantWorkspace(tenantSlug);

  const memberships = await prisma.tenantMembership.findMany({
    where: { tenantId: tenant.id },
    include: { user: true, role: true },
    orderBy: { createdAt: 'desc' },
  });

  return (
    <UsersClient
      tenantSlug={tenantSlug}
      users={memberships.map((m) => ({
        id: m.id,
        fullName: m.user.fullName,
        email: m.user.email,
        roleName: m.role.name,
        roleCode: m.role.code,
        status: m.status,
      }))}
    />
  );
}
