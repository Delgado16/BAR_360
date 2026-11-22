import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { prisma } from '@/infrastructure/database/prisma-client';
import {
  type AuthenticatedTenantContext,
  AuthorizationError,
  type PermissionActionType,
  type ResourceType,
  type RoleCodeType,
  assertTenantAccessAndPermission,
} from '@/domain/policies/rbac.policy';

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  metadata?: Record<string, unknown>;
  requestId: string;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
  };
  requestId: string;
}

export function apiSuccess<T>(
  data: T,
  metadata?: Record<string, unknown>,
  status = 200,
): NextResponse<ApiSuccessResponse<T>> {
  return NextResponse.json(
    {
      success: true,
      data,
      metadata,
      requestId: randomUUID(),
    },
    { status },
  );
}

export function apiError(err: unknown, requestId = randomUUID()): NextResponse<ApiErrorResponse> {
  if (err instanceof AuthorizationError) {
    return NextResponse.json(
      {
        success: false,
        error: { code: err.code, message: err.message },
        requestId,
      },
      { status: err.statusCode },
    );
  }

  const message =
    err instanceof Error ? err.message : 'Error interno procesando la solicitud.';
  const isValidation =
    /obligatorio|inválido|insuficiente|negativo|pertenece|no encontrado|duplicado|no se pueden/i.test(
      message,
    );

  return NextResponse.json(
    {
      success: false,
      error: {
        code: isValidation ? 'BUSINESS_VALIDATION_ERROR' : 'INTERNAL_SERVER_ERROR',
        message: isValidation ? message : 'Error interno del servidor.',
      },
      requestId,
    },
    { status: isValidation ? 400 : 500 },
  );
}

function extractBearerOrCookieToken(request: Request): string | null {
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  const cookieHeader = request.headers.get('cookie') ?? '';
  const match = cookieHeader.match(/(?:^|;\s*)mnp360_access_token=([^;]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

export async function requireAuthenticatedUser(request: Request) {
  const token = extractBearerOrCookieToken(request);
  if (!token) {
    throw new AuthorizationError('Sesión no proporcionada.', 'UNAUTHENTICATED', 401);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new AuthorizationError('Configuración de autenticación incompleta.', 'AUTH_CONFIG_ERROR', 500);
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    throw new AuthorizationError('Token de sesión inválido o expirado.', 'INVALID_SESSION', 401);
  }

  const dbUser = await prisma.user.findUnique({
    where: { supabaseAuthId: data.user.id },
  });

  if (!dbUser || !dbUser.isActive) {
    throw new AuthorizationError('Usuario no registrado o inactivo en plataforma.', 'USER_INACTIVE', 403);
  }

  return dbUser;
}

export async function resolveTenantContext(
  request: Request,
  requestedTenantSlugOrId: string,
): Promise<AuthenticatedTenantContext> {
  const user = await requireAuthenticatedUser(request);

  const tenant = await prisma.tenant.findFirst({
    where: {
      OR: [{ slug: requestedTenantSlugOrId }, { id: requestedTenantSlugOrId }],
    },
  });

  if (!tenant) {
    throw new AuthorizationError('Empresa no encontrada.', 'TENANT_NOT_FOUND', 404);
  }

  const membership = await prisma.tenantMembership.findFirst({
    where: {
      tenantId: tenant.id,
      userId: user.id,
      status: 'ACTIVE',
    },
    include: { role: true },
  });

  if (!membership) {
    throw new AuthorizationError(
      `No tienes membresía activa en la empresa '${tenant.tradeName}'.`,
      'TENANT_ACCESS_DENIED',
      403,
    );
  }

  return {
    userId: user.id,
    email: user.email,
    platformRole: user.platformRole,
    tenantId: tenant.id,
    tenantSlug: tenant.slug,
    tenantStatus: tenant.status,
    roleCode: membership.role.code as RoleCodeType,
  };
}

export function requirePermission(
  ctx: AuthenticatedTenantContext,
  resource: ResourceType,
  action: PermissionActionType,
): void {
  assertTenantAccessAndPermission(ctx, ctx.tenantId, resource, action);
}

export async function requireActiveSubscription(tenantId: string): Promise<void> {
  if (process.env.DISABLE_SUBSCRIPTION_LIMITS === 'true') {
    return;
  }

  const sub = await prisma.subscription.findFirst({
    where: { tenantId },
    orderBy: { createdAt: 'desc' },
  });

  if (sub && (sub.status === 'SUSPENDED' || sub.status === 'CANCELED')) {
    throw new AuthorizationError(
      'La suscripción de esta empresa está suspendida o cancelada.',
      'SUBSCRIPTION_SUSPENDED',
      402,
    );
  }
}
