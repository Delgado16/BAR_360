// ============================================================================
// MI NEGOCIO PRO 360 — SEMILLA INICIAL DE BASE DE DATOS (prisma/seed.ts)
// Crea monedas, permisos granulares, roles del sistema, los 3 planes comerciales
// (Básico, Profesional, Empresarial) y dos empresas de prueba aisladas:
// 1. "Fronteras Bar" (Configuración idéntica al Excel MI_NEGOCIO_PRO_360_LIMPIO.xlsx)
// 2. "Ferretería El Martillo" (Segundo tenant para verificar aislamiento multi-tenant)
// ============================================================================

export const INITIAL_CURRENCIES = [
  { code: 'NIO', name: 'Córdoba nicaragüense', symbol: 'C$', decimalPlaces: 2 },
  { code: 'USD', name: 'Dólar estadounidense', symbol: '$', decimalPlaces: 2 },
  { code: 'MXN', name: 'Peso mexicano', symbol: '$', decimalPlaces: 2 },
  { code: 'COP', name: 'Peso colombiano', symbol: '$', decimalPlaces: 2 },
  { code: 'EUR', name: 'Euro', symbol: '€', decimalPlaces: 2 },
];

export const INITIAL_SUBSCRIPTION_PLANS = [
  {
    code: 'BASIC',
    name: 'Básico',
    description: 'Ideal para un negocio pequeño con ventas, inventario y reportes básicos.',
    monthlyPrice: 19.0,
    annualPrice: 190.0,
    currencyCode: 'USD',
    trialDays: 14,
    maxUsers: 2,
    maxProducts: 250,
    maxMonthlySales: 1500,
    featuresJson: {
      modules: ['dashboard', 'sales', 'products', 'inventory', 'customers', 'basic_reports'],
    },
  },
  {
    code: 'PRO',
    name: 'Profesional',
    description: 'Todas las funciones administrativas, finanzas, CxC, CxP, simulador y conciliación.',
    monthlyPrice: 49.0,
    annualPrice: 490.0,
    currencyCode: 'USD',
    trialDays: 14,
    maxUsers: 10,
    maxProducts: 5000,
    maxMonthlySales: 25000,
    featuresJson: {
      modules: [
        'dashboard',
        'sales',
        'products',
        'inventory',
        'purchases',
        'expenses',
        'customers',
        'suppliers',
        'receivables',
        'payables',
        'cash_accounts',
        'cash_flow',
        'income_statement',
        'advanced_reports',
        'pricing_simulator',
        'reconciliations',
        'excel_import',
      ],
    },
  },
  {
    code: 'ENTERPRISE',
    name: 'Empresarial',
    description: 'Límites ampliados, auditoría avanzada, exportaciones extendidas y soporte prioritario.',
    monthlyPrice: 99.0,
    annualPrice: 990.0,
    currencyCode: 'USD',
    trialDays: 14,
    maxUsers: 100,
    maxProducts: 100000,
    maxMonthlySales: 500000,
    featuresJson: {
      modules: ['all'],
      advancedAudit: true,
      multiBranchReady: true,
    },
  },
];

export const EXCEL_DEFAULT_LISTS = {
  productCategories: [
    'Alimentos',
    'Bebidas',
    'Limpieza',
    'Cuidado personal',
    'Papelería',
    'Otros productos',
    'Servicios',
  ],
  expenseCategories: [
    'Alquiler',
    'Electricidad',
    'Agua',
    'Internet',
    'Transporte',
    'Salarios',
    'Publicidad',
    'Mantenimiento',
    'Comisiones',
    'Otros',
  ],
  paymentMethods: [
    'Efectivo',
    'Transferencia',
    'Tarjeta',
    'Billetera digital',
    'Cheque',
    'Otro',
  ],
  unitsOfMeasure: [
    'Unidad',
    'Bolsa',
    'Botella',
    'Litro',
    'Libra',
    'Kilogramo',
    'Paquete',
    'Lata',
    'Cartón',
    'Caja',
    'Servicio',
    'Hora',
  ],
  financialAccounts: [
    { name: 'Caja general', type: 'CASH' as const, openingBalance: 0 },
    { name: 'Banco principal', type: 'BANK' as const, openingBalance: 0 },
  ],
  taxProfiles: [
    { name: 'Sin impuesto', rate: 0 },
    { name: 'Impuesto A (15%)', rate: 0.15 },
  ],
};

