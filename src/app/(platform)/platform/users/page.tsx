import React from 'react';
import { prisma } from '@/infrastructure/database/prisma-client';
import { PlatformShell } from '@/components/layout/platform-shell';
import { PlatformUsersClient } from '@/components/modules/platform-users-client';

export const dynamic = 'force-dynamic';

export default async function PlatformUsersPage() {
  const users = await prisma.user.findMany({
    include: { _count: { select: { memberships: true } } },
    orderBy: { createdAt: 'desc' },
  });

  return (
    <PlatformShell
      title="Usuarios de Plataforma"
      subtitle="Control de cuentas autenticadas vía Supabase Auth y estado operativo"
      activeHref="/platform/users"
    >
      <PlatformUsersClient
        users={users.map((u) => ({
          id: u.id,
          fullName: u.fullName,
          email: u.email,
          platformRole: u.platformRole,
          isActive: u.isActive,
          membershipsCount: u._count.memberships,
        }))}
      />
    </PlatformShell>
  );
}
