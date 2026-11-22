import React from 'react';
import { prisma } from '@/infrastructure/database/prisma-client';
import { PlatformShell } from '@/components/layout/platform-shell';
import { PlatformSubscriptionsClient } from '@/components/modules/platform-subscriptions-client';

export const dynamic = 'force-dynamic';

export default async function PlatformSubscriptionsPage() {
  const [subscriptions, tenants, plans] = await Promise.all([
    prisma.subscription.findMany({
      include: { tenant: true, plan: true },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.tenant.findMany({ orderBy: { tradeName: 'asc' } }),
    prisma.subscriptionPlan.findMany({ orderBy: { monthlyPrice: 'asc' } }),
  ]);

  return (
    <PlatformShell
      title="Suscripciones"
      subtitle="Asigna planes, cambia ciclos de facturación y gestiona renovaciones o suspensiones"
      activeHref="/platform/subscriptions"
    >
      <PlatformSubscriptionsClient
        tenants={tenants.map((t) => ({ id: t.id, tradeName: t.tradeName }))}
        plans={plans.map((p) => ({ id: p.id, name: p.name, code: p.code }))}
        subscriptions={subscriptions.map((s) => ({
          id: s.id,
          tenantName: s.tenant.tradeName,
          planName: s.plan.name,
          billingInterval: s.billingInterval,
          status: s.status,
          periodEnd: s.currentPeriodEnd.toISOString().slice(0, 10),
        }))}
      />
    </PlatformShell>
  );
}
