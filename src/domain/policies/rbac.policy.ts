// ============================================================================
// MI NEGOCIO PRO 360 — MATRIZ DE ROLES, RECURSOS Y PERMISOS GRANULARES (SECCIÓN 5)
// Toda operación mutativa o de lectura se valida en el servidor contra esta política
// ============================================================================

export type RoleCodeType =
  | 'SUPER_ADMIN'
  | 'TENANT_OWNER'
  | 'TENANT_ADMIN'
  | 'CASHIER_SELLER'
  | 'INVENTORY_MANAGER'
  | 'ACCOUNTANT_FINANCE'
  | 'CUSTOM';

export type ResourceType =
  | 'platform_tenants'
  | 'platform_plans'
  | 'platform_subscriptions'
  | 'platform_metrics'
  | 'platform_incidents'
  | 'platform_audit'
  | 'tenant_settings'
  | 'tenant_users'
  | 'tenant_subscription'
  | 'dashboard'
  | 'products'
  | 'inventory'
  | 'inventory_adjustments'
  | 'sales'
  | 'kitchen'
  | 'purchases'
  | 'expenses'
  | 'customers'
  | 'suppliers'
  | 'receivables'
  | 'payables'
  | 'cash_accounts'
  | 'cash_transfers'
  | 'cash_adjustments'
  | 'cash_flow'
  | 'income_statement'
  | 'reports'
  | 'pricing_simulator'
  | 'reconciliations'
  | 'excel_import';

export type PermissionActionType =
  | 'VIEW'
  | 'CREATE'
  | 'EDIT'
  | 'VOID'
  | 'EXPORT'
  | 'APPROVE'
  | 'MANAGE';

export type PermissionKey = `${ResourceType}:${PermissionActionType}`;

export interface AuthenticatedTenantContext {
  userId: string;
  email: string;
  platformRole: 'USER' | 'SUPER_ADMIN';
  tenantId: string;
  tenantSlug: string;
  tenantStatus: 'ACTIVE' | 'SUSPENDED' | 'TRIAL_EXPIRED' | 'ARCHIVED';
  roleCode: RoleCodeType;
  customGrants?: PermissionKey[];
  customRevocations?: PermissionKey[];
  isAuthorizedSupportAccess?: boolean;
  supportTicketJustification?: string;
}

const ALL_TENANT_RESOURCES: ResourceType[] = [
  'tenant_settings',
  'tenant_users',
  'tenant_subscription',
  'dashboard',
  'products',
  'inventory',
  'inventory_adjustments',
  'sales',
  'kitchen',
  'purchases',
  'expenses',
  'customers',
  'suppliers',
  'receivables',
  'payables',
  'cash_accounts',
  'cash_transfers',
  'cash_adjustments',
  'cash_flow',
  'income_statement',
  'reports',
  'pricing_simulator',
  'reconciliations',
  'excel_import',
];

const ALL_ACTIONS: PermissionActionType[] = [
  'VIEW',
  'CREATE',
  'EDIT',
  'VOID',
  'EXPORT',
  'APPROVE',
  'MANAGE',
];

function expandPermissions(
  resources: ResourceType[],
  actions: PermissionActionType[]
): PermissionKey[] {
  const keys: PermissionKey[] = [];
  for (const r of resources) {
    for (const a of actions) {
      keys.push(`${r}:${a}`);
    }
  }
  return keys;
}

/**
 * Permisos predeterminados por rol inicial según la Sección 5 del Prompt Maestro.
 * Nota crítica de seguridad:
 * SUPER_ADMIN administra empresas, planes, suscripciones, métricas globales e incidencias,
 * pero NO tiene permiso de lectura sobre los recursos financieros privados de una empresa
 * a menos que active un acceso excepcional de soporte con autorización, justificación y auditoría.
 */
export const DEFAULT_ROLE_PERMISSIONS: Record<RoleCodeType, ReadonlySet<PermissionKey>> = {
  SUPER_ADMIN: new Set<PermissionKey>([
    ...expandPermissions(
      [
        'platform_tenants',
        'platform_plans',
        'platform_subscriptions',
        'platform_metrics',
        'platform_incidents',
        'platform_audit',
      ],
      ALL_ACTIONS
    ),
  ]),

  TENANT_OWNER: new Set<PermissionKey>(
    expandPermissions(ALL_TENANT_RESOURCES, ALL_ACTIONS)
  ),

  TENANT_ADMIN: new Set<PermissionKey>([
    ...expandPermissions(
      [
        'dashboard',
        'products',
        'inventory',
        'inventory_adjustments',
        'sales',
        'kitchen',
        'purchases',
        'expenses',
        'customers',
        'suppliers',
        'receivables',
        'payables',
        'cash_accounts',
        'cash_transfers',
        'cash_adjustments',
        'cash_flow',
        'income_statement',
        'reports',
        'pricing_simulator',
        'reconciliations',
        'excel_import',
      ],
      ['VIEW', 'CREATE', 'EDIT', 'VOID', 'EXPORT', 'APPROVE']
    ),
    'tenant_settings:VIEW',
    'tenant_settings:EDIT',
    'tenant_users:VIEW',
    'tenant_users:CREATE',
    'tenant_users:EDIT',
  ]),

  CASHIER_SELLER: new Set<PermissionKey>([
    'dashboard:VIEW',
    'products:VIEW',
    'inventory:VIEW',
    'customers:VIEW',
    'customers:CREATE',
    'customers:EDIT',
    'sales:VIEW',
    'sales:CREATE',
    'kitchen:VIEW',
    'kitchen:CREATE',
    'kitchen:EDIT',
    'receivables:VIEW',
    'receivables:CREATE', // Registrar cobros autorizados
    'cash_accounts:VIEW', // Consultar movimientos de su caja
  ]),

  INVENTORY_MANAGER: new Set<PermissionKey>([
    'dashboard:VIEW',
    'products:VIEW',
    'products:CREATE',
    'products:EDIT',
    'products:EXPORT',
    'inventory:VIEW',
    'inventory:EXPORT',
    'inventory_adjustments:VIEW',
    'inventory_adjustments:CREATE',
    'purchases:VIEW',
    'purchases:CREATE',
    'suppliers:VIEW',
    'suppliers:CREATE',
    'suppliers:EDIT',
  ]),

  ACCOUNTANT_FINANCE: new Set<PermissionKey>([
    'dashboard:VIEW',
    'products:VIEW',
    'inventory:VIEW',
    'inventory:EXPORT',
    'sales:VIEW',
    'sales:EXPORT',
    'purchases:VIEW',
    'purchases:EXPORT',
    'expenses:VIEW',
    'expenses:CREATE',
    'expenses:EDIT',
    'expenses:VOID',
    'expenses:EXPORT',
    'customers:VIEW',
    'suppliers:VIEW',
    'receivables:VIEW',
    'receivables:CREATE',
    'receivables:EXPORT',
    'payables:VIEW',
    'payables:CREATE',
    'payables:EXPORT',
    'cash_accounts:VIEW',
    'cash_accounts:EXPORT',
    'cash_transfers:VIEW',
    'cash_transfers:CREATE',
    'cash_adjustments:VIEW',
    'cash_adjustments:CREATE',
    'cash_flow:VIEW',
    'cash_flow:EXPORT',
    'income_statement:VIEW',
    'income_statement:EXPORT',
    'reports:VIEW',
    'reports:EXPORT',
    'pricing_simulator:VIEW',
    'reconciliations:VIEW',
    'reconciliations:CREATE',
    'reconciliations:EXPORT',
  ]),

  CUSTOM: new Set<PermissionKey>([]),
};

export class AuthorizationError extends Error {
  public readonly code: string;
  public readonly statusCode: number;

  constructor(message: string, code: string = 'FORBIDDEN', statusCode: number = 403) {
    super(message);
    this.name = 'AuthorizationError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

/**
 * Verifica si un contexto autenticado tiene permiso para una acción sobre un recurso.
 */
export function hasPermission(
  ctx: AuthenticatedTenantContext,
  resource: ResourceType,
  action: PermissionActionType
): boolean {
  const key: PermissionKey = `${resource}:${action}`;

  // Regla de privacidad de Superadministrador (Sección 5):
  // No puede leer ni modificar datos financieros privados de empresas por defecto.
  const isPlatformResource = resource.startsWith('platform_');
  if (ctx.roleCode === 'SUPER_ADMIN' && !isPlatformResource) {
    if (
      ctx.isAuthorizedSupportAccess &&
      ctx.supportTicketJustification &&
      ctx.supportTicketJustification.trim().length >= 10 &&
      action === 'VIEW'
    ) {
      return true;
    }
    return false;
  }

  // Si la empresa está suspendida, solo se permite consultar/reactivar suscripción o ver datos en modo lectura al propietario
  if (ctx.tenantStatus === 'SUSPENDED' && !isPlatformResource) {
    if (resource === 'tenant_subscription') {
      return ctx.roleCode === 'TENANT_OWNER';
    }
    if (action !== 'VIEW' && action !== 'EXPORT') {
      return false;
    }
  }

  if (ctx.customRevocations?.includes(key)) {
    return false;
  }

  if (ctx.customGrants?.includes(key)) {
    return true;
  }

  const roleSet = DEFAULT_ROLE_PERMISSIONS[ctx.roleCode];
  return roleSet ? roleSet.has(key) : false;
}

/**
 * Exige que el contexto tenga permiso y que el registro objetivo pertenezca al mismo tenant_id.
 * Lanza AuthorizationError si falla cualquiera de las validaciones.
 */
export function assertTenantAccessAndPermission(
  ctx: AuthenticatedTenantContext,
  targetTenantId: string,
  resource: ResourceType,
  action: PermissionActionType
): void {
  if (!ctx.tenantId || !targetTenantId || ctx.tenantId !== targetTenantId) {
    throw new AuthorizationError(
      'Violación de aislamiento multi-tenant detectada: acceso denegado a registros de otra empresa.',
      'CROSS_TENANT_ACCESS_DENIED',
      403
    );
  }

  if (!hasPermission(ctx, resource, action)) {
    throw new AuthorizationError(
      `El rol '${ctx.roleCode}' no tiene permiso para ejecutar '${action}' sobre '${resource}'.`,
      'INSUFFICIENT_PERMISSIONS',
      403
    );
  }
}
