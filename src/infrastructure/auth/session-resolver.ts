// ============================================================================
// MI NEGOCIO PRO 360 — RESOLUCIÓN DE SESIÓN SUPABASE AUTH Y CONTEXTO MULTI-TENANT
// Nunca confía en un tenant_id enviado por el navegador sin verificar membresía activa
// ============================================================================

import {
  type AuthenticatedTenantContext,
  AuthorizationError,
  type RoleCodeType,
  type PermissionKey,
} from '../../domain/policies/rbac.policy.ts';

export interface UserMembershipRecord {
  tenantId: string;
  tenantSlug: string;
  tenantTradeName: string;
  tenantStatus: 'ACTIVE' | 'SUSPENDED' | 'TRIAL_EXPIRED' | 'ARCHIVED';
  roleCode: RoleCodeType;
  membershipStatus: 'INVITED' | 'ACTIVE' | 'SUSPENDED';
  customGrants?: PermissionKey[];
  customRevocations?: PermissionKey[];
}

export interface AuthenticatedUserSession {
  userId: string;
  supabaseAuthId: string;
  email: string;
  fullName: string;
  platformRole: 'USER' | 'SUPER_ADMIN';
  isActive: boolean;
  memberships: UserMembershipRecord[];
}

/**
 * Resuelve en el servidor el contexto empresarial activo para una solicitud hacia `/[tenantSlug]/...`.
 * Cumple los requisitos 1 a 10 de la Sección 4 (Arquitectura Multi-Tenant).
 */
export function resolveServerTenantContext(
  session: AuthenticatedUserSession | null,
  requestedTenantSlugOrId: string,
  supportOverride?: {
    isAuthorizedSupportAccess: boolean;
    supportTicketJustification: string;
    targetTenantId: string;
    targetTenantSlug: string;
  }
): AuthenticatedTenantContext {
  if (!session || !session.isActive) {
    throw new AuthorizationError('Sesión inválida o usuario inactivo.', 'UNAUTHENTICATED', 401);
  }

  // Si es un Superadministrador con acceso excepcional de soporte explícitamente autorizado y justificado
  if (
    session.platformRole === 'SUPER_ADMIN' &&
    supportOverride?.isAuthorizedSupportAccess &&
    supportOverride.supportTicketJustification.trim().length >= 10
  ) {
    return {
      userId: session.userId,
      email: session.email,
      platformRole: 'SUPER_ADMIN',
      tenantId: supportOverride.targetTenantId,
      tenantSlug: supportOverride.targetTenantSlug,
      tenantStatus: 'ACTIVE',
      roleCode: 'SUPER_ADMIN',
      isAuthorizedSupportAccess: true,
      supportTicketJustification: supportOverride.supportTicketJustification,
    };
  }

  // Buscar membresía activa para el tenant solicitado (por slug o por UUID)
  const membership = session.memberships.find(
    (m) =>
      (m.tenantSlug === requestedTenantSlugOrId || m.tenantId === requestedTenantSlugOrId) &&
      m.membershipStatus === 'ACTIVE'
  );

  if (!membership) {
    throw new AuthorizationError(
      `El usuario '${session.email}' no posee una membresía activa en la empresa solicitada ('${requestedTenantSlugOrId}').`,
      'TENANT_MEMBERSHIP_REQUIRED',
      403
    );
  }

  return {
    userId: session.userId,
    email: session.email,
    platformRole: session.platformRole,
    tenantId: membership.tenantId,
    tenantSlug: membership.tenantSlug,
    tenantStatus: membership.tenantStatus,
    roleCode: membership.roleCode,
    customGrants: membership.customGrants,
    customRevocations: membership.customRevocations,
  };
}
