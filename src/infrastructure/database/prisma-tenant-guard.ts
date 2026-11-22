// ============================================================================
// MI NEGOCIO PRO 360 — CLIENTE PRISMA SINGLETON Y EXTENSIÓN DE AISLAMIENTO MULTI-TENANT
// ============================================================================

import { type AuthenticatedTenantContext, AuthorizationError } from '../../domain/policies/rbac.policy.ts';

/**
 * Envuelve el acceso a Prisma asegurando que cualquier consulta o mutación sobre
 * una tabla empresarial lleve siempre un `tenantId` validado por el servidor.
 */
export function validateServerTenantScope(
  ctx: AuthenticatedTenantContext,
  requestedTenantId: string
): string {
  if (!ctx?.tenantId || ctx.tenantId !== requestedTenantId) {
    throw new AuthorizationError(
      'Bloqueo de seguridad en capa de persistencia: tenant_id no coincide con la sesión autenticada.',
      'PRISMA_TENANT_SCOPE_VIOLATION',
      403
    );
  }
  return ctx.tenantId;
}
