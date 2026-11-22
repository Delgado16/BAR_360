// ============================================================================
// MI NEGOCIO PRO 360 — GUARDIÁN DE AISLAMIENTO MULTI-TENANT Y LÍMITES DE PLAN SaaS
// ============================================================================

import { AuthorizationError, type AuthenticatedTenantContext } from './rbac.policy.ts';

export interface TenantRecord {
  tenantId: string;
}

/**
 * Valida que todos los registros devueltos o mutados pertenezcan estrictamente al tenant del contexto.
 * Previene ataques de acceso horizontal (IDOR / Cross-Tenant Reference).
 */
export function enforceStrictTenantIsolation<T extends TenantRecord>(
  ctx: AuthenticatedTenantContext,
  records: T | T[]
): void {
  const list = Array.isArray(records) ? records : [records];
  for (const item of list) {
    if (!item || item.tenantId !== ctx.tenantId) {
      throw new AuthorizationError(
        'Acceso horizontal bloqueado: intento de lectura o escritura sobre una entidad de otro tenant.',
        'CROSS_TENANT_ACCESS_DENIED',
        403
      );
    }
  }
}

/**
 * Valida que todas las relaciones foráneas (ej. cliente, producto, cuenta financiera, impuesto)
 * pertenezcan exactamente al mismo tenant antes de ejecutar una transacción.
 */
export function assertForeignKeysBelongToTenant(
  expectedTenantId: string,
  relatedEntities: Array<{ entityName: string; id: string; tenantId: string }>
): void {
  for (const rel of relatedEntities) {
    if (rel.tenantId !== expectedTenantId) {
      throw new AuthorizationError(
        `Integridad referencial multi-tenant violada: la entidad '${rel.entityName}' (${rel.id}) pertenece a otro tenant.`,
        'CROSS_TENANT_FK_VIOLATION',
        403
      );
    }
  }
}

export interface PlanEntitlementCheckInput {
  subscriptionStatus: 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'GRACE_PERIOD' | 'SUSPENDED' | 'CANCELED';
  maxUsers: number;
  maxProducts: number;
  maxMonthlySales: number;
  currentUsers: number;
  currentProducts: number;
  currentMonthlySales: number;
  enabledFeatures: ReadonlySet<string>;
}

/**
 * Verifica límites de plan comercial y estado de suscripción SaaS (Sección 20 y Prueba #30).
 * Nota crítica: El impago o suspensión bloquea nuevas operaciones mutativas pero NUNCA borra datos.
 */
export function assertSubscriptionAllowsOperation(
  sub: PlanEntitlementCheckInput,
  operation: 'CREATE_USER' | 'CREATE_PRODUCT' | 'CREATE_SALE' | 'USE_FEATURE',
  featureKey?: string
): void {
  if (process.env.DISABLE_SUBSCRIPTION_LIMITS === 'true') {
    return;
  }

  if (sub.subscriptionStatus === 'SUSPENDED' || sub.subscriptionStatus === 'CANCELED') {
    throw new AuthorizationError(
      'La suscripción de la empresa está suspendida o cancelada. Sus datos están seguros en modo lectura; reactive su plan para registrar nuevas operaciones.',
      'SUBSCRIPTION_SUSPENDED',
      402
    );
  }

  if (operation === 'CREATE_USER' && sub.currentUsers >= sub.maxUsers) {
    throw new AuthorizationError(
      `Ha alcanzado el límite de ${sub.maxUsers} usuarios de su plan actual. Actualice su suscripción para invitar más usuarios.`,
      'PLAN_LIMIT_USERS_EXCEEDED',
      402
    );
  }

  if (operation === 'CREATE_PRODUCT' && sub.currentProducts >= sub.maxProducts) {
    throw new AuthorizationError(
      `Ha alcanzado el límite de ${sub.maxProducts} productos/servicios de su plan actual.`,
      'PLAN_LIMIT_PRODUCTS_EXCEEDED',
      402
    );
  }

  if (operation === 'CREATE_SALE' && sub.currentMonthlySales >= sub.maxMonthlySales) {
    throw new AuthorizationError(
      `Ha alcanzado el límite de ${sub.maxMonthlySales} ventas mensuales de su plan actual.`,
      'PLAN_LIMIT_SALES_EXCEEDED',
      402
    );
  }

  if (operation === 'USE_FEATURE' && featureKey && !sub.enabledFeatures.has(featureKey)) {
    throw new AuthorizationError(
      `La funcionalidad '${featureKey}' requiere el plan Profesional o Empresarial.`,
      'FEATURE_NOT_IN_PLAN',
      402
    );
  }
}
