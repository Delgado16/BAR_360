import React from 'react';
import { cookies } from 'next/headers';
import { TenantEnterpriseShell } from '@/components/layout/tenant-enterprise-shell';
import type { PermissionKey, RoleCodeType } from '@/domain/policies/rbac.policy';

export default async function TenantWorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const cookieStore = await cookies();
  const userEmail = cookieStore.get('mnp360_user_email')?.value ?? 'evaluacion@minegociopro360.com';
  const roleCode = (cookieStore.get('mnp360_role_code')?.value ?? 'TENANT_OWNER') as RoleCodeType;
  const roleName = cookieStore.get('mnp360_role_name')?.value ?? 'PROPIETARIO (Acceso Completo)';

  const customGrants: PermissionKey[] =
    roleCode === 'CUSTOM' && roleName.toLowerCase().includes('cocina')
      ? ['kitchen:VIEW', 'kitchen:EDIT']
      : [];

  const isFerreteria = tenantSlug === 'ferreteria-el-martillo';
  const tradeName = isFerreteria
    ? 'Ferretería El Martillo'
    : tenantSlug === 'fronteras-bar'
      ? 'Fronteras Bar'
      : tenantSlug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <TenantEnterpriseShell
      tenantSlug={tenantSlug}
      tradeName={tradeName}
      currencyCode={isFerreteria ? 'USD' : 'NIO'}
      currencySymbol={isFerreteria ? '$' : 'C$'}
      operatingYear={2026}
      analysisMonthName="Noviembre"
      userEmail={userEmail}
      roleName={roleName}
      roleCode={roleCode}
      customGrants={customGrants}
      reconciliationReviewCount={0}
      lowStockCount={1}
      overdueReceivablesCount={0}
      overduePayablesCount={0}
    >
      {children}
    </TenantEnterpriseShell>
  );
}
