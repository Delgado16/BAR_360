// ============================================================================
// MI NEGOCIO PRO 360 — LAYOUT SHELL EMPRESARIAL MULTI-TENANT (Next.js App Router)
// Incluye selector de empresa (multi-membership), indicadores de estado de
// conciliación (ctl_NRevisar), menú lateral de 18 módulos y modo claro/oscuro.
// ============================================================================

import React from 'react';
import { TENANT_SIDEBAR_NAVIGATION } from '@/components/layout/navigation-config';
import {
  hasPermission,
  type PermissionKey,
  type RoleCodeType,
} from '@/domain/policies/rbac.policy';

export interface TenantShellProps {
  tenantSlug: string;
  tradeName: string;
  currencyCode: string;
  currencySymbol: string;
  operatingYear: number;
  analysisMonthName: string;
  userEmail: string;
  roleName: string;
  roleCode?: RoleCodeType;
  customGrants?: PermissionKey[];
  reconciliationReviewCount: number;
  lowStockCount: number;
  overdueReceivablesCount: number;
  overduePayablesCount: number;
  children: React.ReactNode;
}

export function TenantEnterpriseShell({
  tenantSlug,
  tradeName,
  currencyCode,
  currencySymbol,
  operatingYear,
  analysisMonthName,
  userEmail,
  roleName,
  roleCode = 'TENANT_OWNER',
  customGrants = [],
  reconciliationReviewCount,
  lowStockCount,
  overdueReceivablesCount,
  overduePayablesCount,
  children,
}: TenantShellProps) {
  return (
    <div className="min-h-screen flex bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* Menú Lateral de Empresa (18 Módulos basados en el Excel original) */}
      <aside className="w-64 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800">
          <div className="text-xs font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400">
            MI NEGOCIO PRO 360
          </div>
          <div className="mt-1 font-bold text-base truncate" title={tradeName}>
            {tradeName}
          </div>
          <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Moneda: {currencyCode} ({currencySymbol}) · Año {operatingYear}
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto p-3 space-y-1" aria-label="Menú principal de empresa">
          {TENANT_SIDEBAR_NAVIGATION.filter((item) =>
            hasPermission(
              {
                userId: 'ui',
                email: userEmail,
                platformRole: 'USER',
                tenantId: tenantSlug,
                tenantSlug,
                tenantStatus: 'ACTIVE',
                roleCode,
                customGrants,
              },
              item.requiredResource,
              'VIEW',
            ),
          ).map((item) => {
            let badgeVal = 0;
            if (item.badgeKey === 'lowStock') badgeVal = lowStockCount;
            if (item.badgeKey === 'overdueReceivables') badgeVal = overdueReceivablesCount;
            if (item.badgeKey === 'overduePayables') badgeVal = overduePayablesCount;
            if (item.badgeKey === 'reviewControls') badgeVal = reconciliationReviewCount;

            return (
              <a
                key={item.id}
                href={`/${tenantSlug}${item.hrefSuffix}`}
                className="flex items-center justify-between px-3 py-2 text-sm font-medium rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <span>{item.label}</span>
                {badgeVal > 0 && (
                  <span
                    className={`px-2 py-0.5 text-xs font-semibold rounded-full ${
                      item.badgeKey === 'reviewControls' ||
                      item.badgeKey === 'overdueReceivables' ||
                      item.badgeKey === 'overduePayables'
                        ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                        : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
                    }`}
                  >
                    {badgeVal}
                  </span>
                )}
              </a>
            );
          })}
        </nav>

        <div className="p-3 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 space-y-2">
          <div>
            <div className="font-medium text-slate-700 dark:text-slate-200 truncate">{userEmail}</div>
            <div>Rol: {roleName}</div>
          </div>
          <a
            href="/api/auth/logout"
            className="block text-center py-1.5 rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold"
          >
            Cambiar usuario / Salir
          </a>
        </div>
      </aside>

      {/* Área Principal */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Barra Superior con Cintillo de Estado de Conciliación */}
        <header className="h-14 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-6 flex items-center justify-between">
          <div className="flex items-center gap-4 text-sm">
            <span className="font-medium">
              Mes de análisis: <strong className="text-blue-600 dark:text-blue-400">{analysisMonthName}</strong>
            </span>
            <span className="text-slate-300 dark:text-slate-700">|</span>
            <span className="text-xs text-slate-500">Ventas netas = sin impuesto</span>
          </div>

          <div className="flex items-center gap-3">
            {reconciliationReviewCount === 0 ? (
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                ✔ Controles de calidad OK
              </span>
            ) : (
              <a
                href={`/${tenantSlug}/reconciliations`}
                className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
              >
                ⚠ {reconciliationReviewCount} control(es) por revisar
              </a>
            )}
          </div>
        </header>

        <main className="flex-1 p-6 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}

