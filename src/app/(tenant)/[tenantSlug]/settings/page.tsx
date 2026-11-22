import React from 'react';
import { ensureTenantWorkspace } from '@/infrastructure/database/tenant-bootstrap';
import { SettingsClient } from '@/components/modules/settings-client';

export const dynamic = 'force-dynamic';

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const tenant = await ensureTenantWorkspace(tenantSlug);
  const s = tenant.settings!;

  return (
    <SettingsClient
      tenantSlug={tenantSlug}
      initial={{
        tradeName: s.tradeName,
        currencyCode: s.currencyCode,
        currencySymbol: s.currencySymbol,
        operatingYear: s.operatingYear,
        analysisMonth: s.analysisMonth,
        taxTreatment: s.taxTreatment,
        allowNegativeStock: s.allowNegativeStock,
      }}
    />
  );
}
