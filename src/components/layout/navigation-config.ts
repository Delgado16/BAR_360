// ============================================================================
// MI NEGOCIO PRO 360 — CONFIGURACIÓN DE NAVEGACIÓN (SECCIÓN 19)
// Separación estricta entre Menú de Empresa (18 módulos) y Menú de Plataforma SaaS (10 módulos)
// ============================================================================

import { ResourceType } from '@/domain/policies/rbac.policy';

export interface NavItemConfig {
  id: string;
  label: string;
  hrefSuffix: string;
  iconName: string;
  requiredResource: ResourceType;
  badgeKey?: 'lowStock' | 'overdueReceivables' | 'overduePayables' | 'reviewControls';
  group: 'OPERACIONES' | 'CATÁLOGOS' | 'FINANZAS' | 'INTELIGENCIA' | 'CONTROL_Y_CONFIG';
}

export const TENANT_SIDEBAR_NAVIGATION: ReadonlyArray<NavItemConfig> = [
  {
    id: 'dashboard',
    label: 'Inicio / Dashboard',
    hrefSuffix: '/dashboard',
    iconName: 'LayoutDashboard',
    requiredResource: 'dashboard',
    group: 'OPERACIONES',
  },
  {
    id: 'sales',
    label: 'Ventas / POS Bar',
    hrefSuffix: '/sales',
    iconName: 'ShoppingCart',
    requiredResource: 'sales',
    group: 'OPERACIONES',
  },
  {
    id: 'kitchen',
    label: 'Cocina (Comandas)',
    hrefSuffix: '/kitchen',
    iconName: 'UtensilsCrossed',
    requiredResource: 'kitchen',
    group: 'OPERACIONES',
  },
  {
    id: 'products',
    label: 'Productos y servicios',
    hrefSuffix: '/products',
    iconName: 'Package',
    requiredResource: 'products',
    group: 'CATÁLOGOS',
  },
  {
    id: 'inventory',
    label: 'Inventario',
    hrefSuffix: '/inventory',
    iconName: 'Boxes',
    requiredResource: 'inventory',
    badgeKey: 'lowStock',
    group: 'OPERACIONES',
  },
  {
    id: 'purchases',
    label: 'Compras',
    hrefSuffix: '/purchases',
    iconName: 'Truck',
    requiredResource: 'purchases',
    group: 'OPERACIONES',
  },
  {
    id: 'expenses',
    label: 'Gastos operativos',
    hrefSuffix: '/expenses',
    iconName: 'Receipt',
    requiredResource: 'expenses',
    group: 'OPERACIONES',
  },
  {
    id: 'customers',
    label: 'Clientes',
    hrefSuffix: '/customers',
    iconName: 'Users',
    requiredResource: 'customers',
    group: 'CATÁLOGOS',
  },
  {
    id: 'suppliers',
    label: 'Proveedores',
    hrefSuffix: '/suppliers',
    iconName: 'Building2',
    requiredResource: 'suppliers',
    group: 'CATÁLOGOS',
  },
  {
    id: 'receivables',
    label: 'Cuentas por cobrar',
    hrefSuffix: '/receivables',
    iconName: 'ArrowDownLeft',
    requiredResource: 'receivables',
    badgeKey: 'overdueReceivables',
    group: 'FINANZAS',
  },
  {
    id: 'payables',
    label: 'Cuentas por pagar',
    hrefSuffix: '/payables',
    iconName: 'ArrowUpRight',
    requiredResource: 'payables',
    badgeKey: 'overduePayables',
    group: 'FINANZAS',
  },
  {
    id: 'cash',
    label: 'Caja y bancos',
    hrefSuffix: '/cash',
    iconName: 'Landmark',
    requiredResource: 'cash_accounts',
    group: 'FINANZAS',
  },
  {
    id: 'cash-flow',
    label: 'Flujo de caja',
    hrefSuffix: '/cash-flow',
    iconName: 'TrendingUp',
    requiredResource: 'cash_flow',
    group: 'INTELIGENCIA',
  },
  {
    id: 'income-statement',
    label: 'Estado de resultados',
    hrefSuffix: '/income-statement',
    iconName: 'FileSpreadsheet',
    requiredResource: 'income_statement',
    group: 'INTELIGENCIA',
  },
  {
    id: 'reports',
    label: 'Reportes',
    hrefSuffix: '/reports',
    iconName: 'BarChart3',
    requiredResource: 'reports',
    group: 'INTELIGENCIA',
  },
  {
    id: 'pricing-simulator',
    label: 'Simulador de precios',
    hrefSuffix: '/pricing-simulator',
    iconName: 'Calculator',
    requiredResource: 'pricing_simulator',
    group: 'INTELIGENCIA',
  },
  {
    id: 'movements',
    label: 'Movimientos y ajustes',
    hrefSuffix: '/movements',
    iconName: 'ArrowLeftRight',
    requiredResource: 'cash_transfers',
    group: 'FINANZAS',
  },
  {
    id: 'reconciliations',
    label: 'Controles y conciliación',
    hrefSuffix: '/reconciliations',
    iconName: 'ShieldCheck',
    requiredResource: 'reconciliations',
    badgeKey: 'reviewControls',
    group: 'CONTROL_Y_CONFIG',
  },
  {
    id: 'users',
    label: 'Usuarios del Negocio',
    hrefSuffix: '/users',
    iconName: 'Users',
    requiredResource: 'tenant_users',
    group: 'CONTROL_Y_CONFIG',
  },
  {
    id: 'settings',
    label: 'Configuración',
    hrefSuffix: '/settings',
    iconName: 'Settings',
    requiredResource: 'tenant_settings',
    group: 'CONTROL_Y_CONFIG',
  },
];

export interface PlatformNavItemConfig {
  id: string;
  label: string;
  href: string;
  iconName: string;
}

export const PLATFORM_SIDEBAR_NAVIGATION: ReadonlyArray<PlatformNavItemConfig> = [
  { id: 'global-dashboard', label: 'Dashboard global', href: '/platform/dashboard', iconName: 'Globe' },
  { id: 'tenants', label: 'Empresas', href: '/platform/tenants', iconName: 'Building' },
  { id: 'users', label: 'Usuarios', href: '/platform/users', iconName: 'Users' },
  { id: 'plans', label: 'Planes', href: '/platform/plans', iconName: 'Layers' },
  { id: 'subscriptions', label: 'Suscripciones', href: '/platform/subscriptions', iconName: 'CreditCard' },
  { id: 'payments', label: 'Pagos', href: '/platform/payments', iconName: 'DollarSign' },
  { id: 'resource-usage', label: 'Uso de recursos', href: '/platform/usage', iconName: 'Activity' },
  { id: 'incidents', label: 'Incidencias', href: '/platform/incidents', iconName: 'AlertTriangle' },
  { id: 'audit', label: 'Auditoría', href: '/platform/audit', iconName: 'FileSearch' },
  { id: 'platform-settings', label: 'Configuración de plataforma', href: '/platform/settings', iconName: 'Sliders' },
];

