import assert from 'node:assert/strict';
import {
  type AuthenticatedTenantContext,
  hasPermission,
  assertTenantAccessAndPermission,
} from '../domain/policies/rbac.policy.ts';
import { resolveServerTenantContext, type AuthenticatedUserSession } from '../infrastructure/auth/session-resolver.ts';
import { EnterpriseSaaSEngine } from '../domain/services/enterprise-saas.service.ts';
import { runEquivalenceTestSuite } from './financial-equivalence.spec.ts';

console.log('======================================================================');
console.log('MI NEGOCIO PRO 360 — EJECUCIÓN DE PRUEBAS AUTOMATIZADAS (FASES 0 Y 1)');
console.log('======================================================================\n');

// 1. Ejecutar suite de equivalencia matemática del Excel original
const eqResults = runEquivalenceTestSuite();
for (const line of eqResults.details) {
  console.log('  ' + line);
}
assert.equal(eqResults.failed, 0, `Fallaron ${eqResults.failed} pruebas de equivalencia con el Excel.`);
console.log(`\n✔ Suite de equivalencia Excel superada: ${eqResults.passed}/${eqResults.passed} pruebas OK.\n`);

// 2. Pruebas de Fundación SaaS: Aislamiento entre dos empresas reales ("Fronteras Bar" vs "Ferretería El Martillo")
const engine = new EnterpriseSaaSEngine();

const ownerFronteras: AuthenticatedTenantContext = {
  userId: 'user-owner-1',
  email: 'propietario@fronterasbar.com',
  platformRole: 'USER',
  tenantId: 'tenant-fronteras-1111',
  tenantSlug: 'fronteras-bar',
  tenantStatus: 'ACTIVE',
  roleCode: 'TENANT_OWNER',
};

const cashierFronteras: AuthenticatedTenantContext = {
  userId: 'user-cashier-1',
  email: 'cajero@fronterasbar.com',
  platformRole: 'USER',
  tenantId: 'tenant-fronteras-1111',
  tenantSlug: 'fronteras-bar',
  tenantStatus: 'ACTIVE',
  roleCode: 'CASHIER_SELLER',
};

const ownerFerreteria: AuthenticatedTenantContext = {
  userId: 'user-owner-2',
  email: 'dueno@elmartillo.com',
  platformRole: 'USER',
  tenantId: 'tenant-ferreteria-2222',
  tenantSlug: 'ferreteria-el-martillo',
  tenantStatus: 'ACTIVE',
  roleCode: 'TENANT_OWNER',
};

const superAdminDefault: AuthenticatedTenantContext = {
  userId: 'user-superadmin-0',
  email: 'root@minegociopro360.com',
  platformRole: 'SUPER_ADMIN',
  tenantId: 'platform-global',
  tenantSlug: 'platform',
  tenantStatus: 'ACTIVE',
  roleCode: 'SUPER_ADMIN',
};

// Inicializar ambas empresas con configuraciones independientes
const cfgFronteras = engine.initializeTenant(ownerFronteras, {
  tradeName: 'Fronteras Bar',
  businessType: 'Comercio minorista / tienda',
  currencyCode: 'NIO',
  currencySymbol: 'C$',
  operatingYear: 2026,
  analysisMonth: 11,
});

const cfgFerreteria = engine.initializeTenant(ownerFerreteria, {
  tradeName: 'Ferretería El Martillo',
  businessType: 'Ferretería / construcción',
  currencyCode: 'USD',
  currencySymbol: '$',
  operatingYear: 2026,
  analysisMonth: 11,
});

assert.equal(cfgFronteras.currencyCode, 'NIO');
assert.equal(cfgFerreteria.currencyCode, 'USD');
console.log('  PASS: Creación y configuración independiente de dos tenants reales (Fronteras Bar [NIO] y Ferretería El Martillo [USD]).');

// Crear catálogos en Tenant 1 (Fronteras Bar)
const catBebidas = engine.createCategory(ownerFronteras, { id: 'cat-t1-bebidas', name: 'Bebidas', type: 'PRODUCT' });
const taxZeroT1 = engine.createTaxProfile(ownerFronteras, { id: 'tax-t1-zero', name: 'Sin impuesto', rate: 0 });
const accCajaT1 = engine.createFinancialAccount(ownerFronteras, {
  id: 'acc-t1-caja',
  name: 'Caja general',
  type: 'CASH',
  openingBalance: 0,
});
const pmEfectivoT1 = engine.createPaymentMethod(ownerFronteras, { id: 'pm-t1-efectivo', name: 'Efectivo' });
const cliMostradorT1 = engine.createCustomer(ownerFronteras, {
  id: 'cli-t1-gen',
  code: 'CLI01',
  name: 'Cliente Mostrador',
  customerType: 'GENERIC',
});
const prodTonaT1 = engine.createProduct(ownerFronteras, {
  id: 'prod-t1-sku01',
  sku: 'SKU01',
  name: 'Cerveza Toña 1L',
  categoryId: catBebidas.id,
  type: 'PRODUCT',
  unitName: 'Unidad',
  salePrice: 100,
  referenceCost: 80,
  minimumStock: 48,
  openingStockQuantity: 100,
  openingUnitCost: 80,
});

// Crear catálogos en Tenant 2 (Ferretería El Martillo) con el MISMO código SKU01 (debe permitirse porque el SKU es único POR TENANT)
const catHerramientas = engine.createCategory(ownerFerreteria, {
  id: 'cat-t2-herr',
  name: 'Herramientas',
  type: 'PRODUCT',
});
const prodMartilloT2 = engine.createProduct(ownerFerreteria, {
  id: 'prod-t2-sku01',
  sku: 'SKU01',
  name: 'Martillo Carpintero 16oz',
  categoryId: catHerramientas.id,
  type: 'PRODUCT',
  unitName: 'Unidad',
  salePrice: 25,
  referenceCost: 15,
  minimumStock: 10,
  openingStockQuantity: 50,
  openingUnitCost: 15,
});

assert.equal(prodTonaT1.sku, 'SKU01');
assert.equal(prodMartilloT2.sku, 'SKU01');
console.log('  PASS: Unicidad de SKU por tenant verificada (ambas empresas pueden usar SKU01 sin colisión).');

// Verificar que ninguna consulta de Tenant 1 devuelve productos de Tenant 2 y viceversa
const listT1 = engine.listProducts(ownerFronteras);
const listT2 = engine.listProducts(ownerFerreteria);
assert.equal(listT1.length, 1);
assert.equal(listT1[0]?.name, 'Cerveza Toña 1L');
assert.equal(listT2.length, 1);
assert.equal(listT2[0]?.name, 'Martillo Carpintero 16oz');
console.log('  PASS: Aislamiento de lectura verificado (ninguna consulta filtra registros del otro tenant).');

// Prueba #25: Probar ataques de acceso horizontal entre empresas (IDOR / Cross-Tenant Query & Foreign Key Injection)
assert.throws(
  () => engine.listProducts(ownerFronteras, ownerFerreteria.tenantId),
  /Violación de aislamiento multi-tenant/,
  'Debe bloquear lectura cruzada de otra empresa'
);

assert.throws(
  () => engine.getProductCostingSummary(ownerFerreteria, prodTonaT1.id),
  /Violación de aislamiento multi-tenant/,
  'Debe bloquear consulta de costos de un producto perteneciente a otro tenant'
);

// Intento de ataque de clave foránea cruzada: Tenant 2 intenta crear un producto usando una categoría de Tenant 1
assert.throws(
  () =>
    engine.createProduct(ownerFerreteria, {
      id: 'prod-t2-attack',
      sku: 'SKU-HACK',
      name: 'Producto Inyectado',
      categoryId: catBebidas.id, // pertenece a Tenant 1!
      type: 'PRODUCT',
      unitName: 'Unidad',
      salePrice: 10,
      referenceCost: 5,
      minimumStock: 1,
      openingStockQuantity: 0,
      openingUnitCost: 0,
    }),
  /Integridad referencial multi-tenant violada/,
  'Debe bloquear claves foráneas que apunten a entidades de otro tenant'
);
console.log('  PASS: Ataques de acceso horizontal (lectura cruzada, IDOR y claves foráneas entre tenants) bloqueados con 403.');

// Prueba #26: Restricción por rol (Vendedor/Cajero vs Propietario vs Superadministrador)
// El cajero puede registrar una venta pero NO puede anularla ni cambiar la configuración fiscal
const saleT1 = engine.registerSale(cashierFronteras, {
  id: 'sale-t1-001',
  saleNumber: 'VTA-0001',
  customerId: cliMostradorT1.id,
  date: '2026-11-02',
  paymentCondition: 'CASH',
  paymentMethodId: pmEfectivoT1.id,
  financialAccountId: accCajaT1.id,
  idempotencyKey: 'idem-sale-001',
  lines: [
    {
      productId: prodTonaT1.id,
      quantity: 2,
      unitPrice: 100,
      taxProfileId: taxZeroT1.id,
    },
  ],
});
assert.equal(saleT1.grandTotal, 200);
assert.equal(saleT1.costTotal, 160);
assert.equal(saleT1.grossProfit, 40);
console.log('  PASS: Cajero/Vendedor puede registrar ventas de contado con cálculo automático de costo histórico CPP.');

assert.throws(
  () => engine.voidSale(cashierFronteras, saleT1.id, 'Intento no autorizado'),
  /no tiene permiso para ejecutar 'VOID' sobre 'sales'/,
  'El cajero no debe poder anular ventas confirmadas'
);

assert.throws(
  () => engine.updateTaxTreatment(cashierFronteras, 'NON_RECOVERABLE'),
  /no tiene permiso para ejecutar 'EDIT' sobre 'tenant_settings'/,
  'El cajero no debe poder modificar la configuración fiscal'
);
console.log('  PASS: Restricción RBAC por rol en el backend verificada (Cajero bloqueado en anulaciones y configuración).');

// Privacidad del Superadministrador de plataforma (Sección 5):
// Puede gestionar planes/empresas globales, pero NO puede leer datos financieros privados por defecto
assert.equal(hasPermission(superAdminDefault, 'platform_tenants', 'MANAGE'), true);
assert.equal(hasPermission(superAdminDefault, 'income_statement', 'VIEW'), false);
assert.equal(hasPermission(superAdminDefault, 'sales', 'VIEW'), false);

// Solo con autorización excepcional de soporte, ticket justificado y en modo solo lectura (VIEW)
const superAdminAuthorizedSupport: AuthenticatedTenantContext = {
  ...superAdminDefault,
  tenantId: ownerFronteras.tenantId,
  tenantSlug: ownerFronteras.tenantSlug,
  isAuthorizedSupportAccess: true,
  supportTicketJustification: 'INC-2026-8891: Solicitud explícita del propietario para verificar cuadre.',
};
assert.equal(hasPermission(superAdminAuthorizedSupport, 'income_statement', 'VIEW'), true);
assert.equal(hasPermission(superAdminAuthorizedSupport, 'sales', 'VOID'), false);
console.log('  PASS: Privacidad financiera ante Superadministrador verificada (bloqueado por defecto; solo lectura con ticket auditado).');

// Prueba #27: Doble envío de transacción (Idempotencia por doble clic)
assert.throws(
  () =>
    engine.registerSale(cashierFronteras, {
      id: 'sale-t1-001-dup',
      saleNumber: 'VTA-0002',
      customerId: cliMostradorT1.id,
      date: '2026-11-02',
      paymentCondition: 'CASH',
      paymentMethodId: pmEfectivoT1.id,
      financialAccountId: accCajaT1.id,
      idempotencyKey: 'idem-sale-001', // Misma clave de idempotencia!
      lines: [
        {
          productId: prodTonaT1.id,
          quantity: 2,
          unitPrice: 100,
          taxProfileId: taxZeroT1.id,
        },
      ],
    }),
  /Operación duplicada bloqueada por clave de idempotencia/,
  'Debe rechazar transacciones con idempotencyKey repetida'
);
console.log('  PASS: Prevención de duplicación de ventas por doble clic (idempotency_key) verificada.');

// Prueba de Resolución de Sesión Multi-Membresía (Un usuario pertenece a varias empresas con distintos roles)
const multiTenantUserSession: AuthenticatedUserSession = {
  userId: 'user-multi-99',
  supabaseAuthId: 'auth-uuid-99',
  email: 'contador@despacho.com',
  fullName: 'Lic. Carlos Mendoza',
  platformRole: 'USER',
  isActive: true,
  memberships: [
    {
      tenantId: ownerFronteras.tenantId,
      tenantSlug: 'fronteras-bar',
      tenantTradeName: 'Fronteras Bar',
      tenantStatus: 'ACTIVE',
      roleCode: 'ACCOUNTANT_FINANCE',
      membershipStatus: 'ACTIVE',
    },
    {
      tenantId: ownerFerreteria.tenantId,
      tenantSlug: 'ferreteria-el-martillo',
      tenantTradeName: 'Ferretería El Martillo',
      tenantStatus: 'ACTIVE',
      roleCode: 'TENANT_OWNER',
      membershipStatus: 'ACTIVE',
    },
  ],
};

const ctxInFronteras = resolveServerTenantContext(multiTenantUserSession, 'fronteras-bar');
const ctxInFerreteria = resolveServerTenantContext(multiTenantUserSession, 'ferreteria-el-martillo');
assert.equal(ctxInFronteras.roleCode, 'ACCOUNTANT_FINANCE');
assert.equal(ctxInFerreteria.roleCode, 'TENANT_OWNER');
assert.throws(
  () => resolveServerTenantContext(multiTenantUserSession, 'empresa-ajena'),
  /no posee una membresía activa/
);
console.log('  PASS: Usuario multi-empresa con roles diferenciados por tenant y bloqueo de empresas no autorizadas verificado.');

// Verificar que los 31 Controles de Conciliación cuadran al 100% tras las operaciones en Fronteras Bar
const reconFronteras = engine.executeReconciliationCenter(ownerFronteras);
assert.equal(reconFronteras.reviewCount, 0);
assert.equal(reconFronteras.okCount, 31);
console.log(`  PASS: Centro de Control y Conciliación en Fronteras Bar: ${reconFronteras.okCount}/31 controles en estado OK (0 por revisar).`);

console.log('\n======================================================================');
console.log('RESULTADO FINAL: TODAS LAS PRUEBAS DE FASE 0 Y FASE 1 PASARON AL 100%');
console.log('======================================================================');
