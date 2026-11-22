import assert from 'node:assert/strict';
import { type AuthenticatedTenantContext } from '../domain/policies/rbac.policy.ts';
import { EnterpriseSaaSEngine } from '../domain/services/enterprise-saas.service.ts';
import { CatalogsAndConfigService } from '../domain/services/catalogs-config.service.ts';
import {
  validateBusinessSettingsInput,
  validateTaxProfileInput,
  validateProductCatalogInput,
} from '../modules/catalogs/catalog-validators.ts';

console.log('======================================================================');
console.log('MI NEGOCIO PRO 360 — EJECUCIÓN DE PRUEBAS AUTOMATIZADAS (FASE 2)');
console.log('======================================================================\n');

const engine = new EnterpriseSaaSEngine();
const catalogService = new CatalogsAndConfigService(engine);

const ownerCtx: AuthenticatedTenantContext = {
  userId: 'user-owner-f2',
  email: 'admin@fronterasbar.com',
  platformRole: 'USER',
  tenantId: 'tenant-f2-fronteras',
  tenantSlug: 'fronteras-bar',
  tenantStatus: 'ACTIVE',
  roleCode: 'TENANT_OWNER',
};

// 1. Sembrado de configuración inicial idéntico a la hoja CONFIGURACIÓN del Excel
const seeded = catalogService.seedDefaultConfigurationForTenant(ownerCtx, {
  tradeName: 'Fronteras Bar',
  businessType: 'Comercio minorista / tienda',
  currencyCode: 'NIO',
  operatingYear: 2026,
  analysisMonth: 11,
});

assert.equal(seeded.settings.currencyCode, 'NIO');
assert.equal(seeded.settings.currencySymbol, 'C$');
assert.equal(seeded.settings.operatingYear, 2026);
assert.equal(seeded.settings.analysisMonth, 11);
assert.equal(seeded.settings.defaultCustomerCreditDays, 30);
assert.equal(seeded.settings.defaultSupplierCreditDays, 30);
assert.equal(seeded.settings.targetInventoryCoverage, 2);
assert.equal(seeded.settings.taxTreatment, 'RECOVERABLE');
assert.equal(seeded.settings.reconciliationTolerance, 0.01);
assert.equal(seeded.productCategories.length, 7);
assert.equal(seeded.expenseCategories.length, 10);
assert.equal(seeded.paymentMethods.length, 6);
assert.equal(seeded.unitsOfMeasure.length, 12);
assert.equal(seeded.financialAccounts.length, 2);
assert.equal(seeded.taxProfiles.length, 1);
console.log(
  '  PASS: Sembrado de CONFIGURACIÓN inicial completado (7 cat. productos, 10 cat. gastos, 6 métodos pago, 12 unidades, 2 cuentas, impuestos).'
);

// 2. Validación de entradas de Configuración y Perfiles de Impuesto (Data Validations de Hoja 2)
const invalidSettings = validateBusinessSettingsInput({
  tradeName: '',
  businessType: 'Comercio minorista / tienda',
  currencyCode: 'INVALID',
  operatingYear: 1995, // fuera de 2000..2100
  analysisMonth: 13,   // fuera de 1..12
  rankingCriterion: 'REVENUE',
  defaultCustomerCreditDays: -5,
  defaultSupplierCreditDays: 30,
  targetInventoryCoverage: 0,
  taxTreatment: 'RECOVERABLE',
  reconciliationTolerance: 2,
});
assert.equal(invalidSettings.success, false);
assert.equal(invalidSettings.errors.length, 7);

const validTax = validateTaxProfileInput({ name: 'IVA 15%', rate: 0.15 });
assert.equal(validTax.success, true);
const invalidTax = validateTaxProfileInput({ name: 'Impuesto Inválido', rate: 1.5 });
assert.equal(invalidTax.success, false);
console.log('  PASS: Validaciones de parámetros de CONFIGURACIÓN y tasas de impuestos (0..1) verificadas.');

// 3. Crear proveedores y clientes con validación de duplicados (Hojas 9 y 10)
const supDistribuidora = engine.createSupplier(ownerCtx, {
  id: 'sup-1',
  code: 'PRV01',
  name: 'Cervecería Nacional',
  contactName: 'Juan Pérez',
  phone: '8888-0001',
});

assert.throws(
  () =>
    engine.createSupplier(ownerCtx, {
      id: 'sup-2',
      code: 'PRV01', // Código duplicado
      name: 'Otro Proveedor',
    }),
  /ID o Nombre de proveedor duplicado/,
  'Debe rechazar proveedor con ID duplicado'
);

const cliMostrador = engine.createCustomer(ownerCtx, {
  id: 'cli-1',
  code: 'CLI-GEN',
  name: 'Cliente Mostrador',
  customerType: 'GENERIC',
});

const cliCorporativo = engine.createCustomer(ownerCtx, {
  id: 'cli-2',
  code: 'CLI-001',
  name: 'Restaurante El Mirador',
  customerType: 'REGISTERED',
});

assert.throws(
  () =>
    engine.createCustomer(ownerCtx, {
      id: 'cli-3',
      code: 'CLI-999',
      name: 'Restaurante El Mirador', // Nombre duplicado
      customerType: 'REGISTERED',
    }),
  /ID o Nombre de cliente duplicado/,
  'Debe rechazar cliente con nombre duplicado'
);
console.log('  PASS: Creación y prevención de duplicados en CLIENTES y PROVEEDORES verificadas.');

// 4. Catálogo de Productos y Servicios (Hoja 4: PRODUCTOS Y SERVICIOS)
// Crear 1 Producto físico (SKU01) y 1 Servicio (SRV01)
const catBebidas = seeded.productCategories.find((c) => c.name === 'Bebidas')!;
const catServicios = seeded.productCategories.find((c) => c.name === 'Servicios')!;

const prodTona = engine.createProduct(ownerCtx, {
  id: 'prod-sku01',
  sku: 'SKU01',
  name: 'Cerveza Toña 1L',
  description: 'Cerveza toña de litro',
  categoryId: catBebidas.id,
  type: 'PRODUCT',
  unitName: 'Unidad',
  salePrice: 100,
  referenceCost: 80,
  preferredSupplierId: supDistribuidora.id,
  minimumStock: 48,
  openingStockQuantity: 20,
  openingUnitCost: 80,
});

const prodServicio = engine.createProduct(ownerCtx, {
  id: 'prod-srv01',
  sku: 'SRV01',
  name: 'Reservación Evento Privado',
  description: 'Alquiler de salón y atención de evento',
  categoryId: catServicios.id,
  type: 'SERVICE',
  unitName: 'Servicio',
  salePrice: 500,
  referenceCost: 0,
  minimumStock: 0,
  openingStockQuantity: 0,
  openingUnitCost: 0,
});

const catalogView = catalogService.getProductCatalogView(ownerCtx);
assert.equal(catalogView.summary.totalRegistered, 2);
assert.equal(catalogView.summary.productsCount, 1);
assert.equal(catalogView.summary.servicesCount, 1);
assert.equal(catalogView.summary.controlAlertsCount, 0);

// Verificar fórmula I7: Margen bruto estimado = (100 - 80)/100 = 0.2 (20%)
const sku01View = catalogView.items.find((i) => i.sku === 'SKU01')!;
assert.equal(sku01View.estimatedGrossMargin, 0.2);
assert.equal(sku01View.controlStatus, 'OK');

// Verificar diferenciación crítica entre lst_SKU (Ventas/Simulador) y lst_SKUprod (Compras/Ajustes Inv.)
assert.deepEqual(catalogView.lstSKU, ['SKU01', 'SRV01']);
assert.deepEqual(catalogView.lstSKUprod, ['SKU01']);
console.log(
  '  PASS: Catálogo de Productos y Servicios verificado (Margen estimado 20%, lst_SKU=[SKU01, SRV01], lst_SKUprod=[SKU01]).'
);

// 5. Verificar que un Servicio (SRV01) NO genera stock en Inventario y está bloqueado en Compras de Inventario
const srvCosting = engine.getProductCostingSummary(ownerCtx, prodServicio.id);
assert.equal(srvCosting.finalStock, 0);
assert.equal(srvCosting.inventoryState, 'SERVICE_NO_STOCK');
assert.equal(srvCosting.suggestedReplenishment, 0);

assert.throws(
  () =>
    engine.registerPurchase(ownerCtx, {
      id: 'comp-fail-srv',
      purchaseNumber: 'COMP-ERR1',
      supplierId: supDistribuidora.id,
      date: '2026-11-03',
      productId: prodServicio.id,
      quantity: 1,
      unitCost: 100,
      taxProfileId: seeded.taxProfiles[0]!.id,
      paymentCondition: 'CASH',
      financialAccountId: seeded.financialAccounts[0]!.id,
    }),
  /Un servicio no es inventario \(use Gastos\)/,
  'Hoja COMPRAS!S7 debe rechazar compras de ítems de tipo Servicio'
);
console.log('  PASS: Regla de Servicios verificada (sin inventario y bloqueados en Compras de mercadería).');

// 6. Verificar Directorio de Clientes (totales, saldo pendiente y exclusión de Cliente Mostrador en cli_Rank)
const saleMostrador = engine.registerSale(ownerCtx, {
  id: 'sale-mostrador-1',
  saleNumber: 'VTA-0101',
  customerId: cliMostrador.id,
  date: '2026-11-05',
  paymentCondition: 'CASH',
  paymentMethodId: seeded.paymentMethods[0]!.id,
  financialAccountId: seeded.financialAccounts[0]!.id,
  lines: [
    {
      productId: prodTona.id,
      quantity: 5,
      unitPrice: 100,
      taxProfileId: seeded.taxProfiles[0]!.id,
    },
  ],
});

const saleCorporativo = engine.registerSale(ownerCtx, {
  id: 'sale-corp-1',
  saleNumber: 'VTA-0102',
  customerId: cliCorporativo.id,
  date: '2026-11-06',
  paymentCondition: 'CREDIT',
  lines: [
    {
      productId: prodTona.id,
      quantity: 3,
      unitPrice: 100,
      taxProfileId: seeded.taxProfiles[0]!.id,
    },
  ],
});

// Aunque el Cliente Mostrador compró C$ 500 y el Cliente Registrado compró C$ 300,
// en el ranking de clientes principales (Hoja 9 Col N y Hoja 16 Reporte #7) el Cliente Mostrador queda excluido!
const custDirectory = catalogService.getCustomersDirectoryView(
  ownerCtx,
  [cliMostrador, cliCorporativo],
  [saleMostrador, saleCorporativo],
  []
);

assert.equal(custDirectory.summary.registeredCustomersCount, 2);
assert.equal(custDirectory.summary.totalSoldWithTax, 800);
assert.equal(custDirectory.summary.totalCollected, 500);
assert.equal(custDirectory.summary.totalPendingBalance, 300);
assert.equal(custDirectory.topRankedRegisteredCustomers.length, 1);
assert.equal(custDirectory.topRankedRegisteredCustomers[0]?.name, 'Restaurante El Mirador');
console.log(
  '  PASS: Directorio de Clientes y Ranking verificados (excluye cliente "Genérico (mostrador)" del Top Clientes tal como CLIENTES!N7).'
);

// 7. Verificar Directorio de Proveedores (conteo de productos vinculados en catálogo y saldo)
const supDirectory = catalogService.getSuppliersDirectoryView(
  ownerCtx,
  [supDistribuidora],
  [],
  []
);
assert.equal(supDirectory.rows[0]?.catalogProductsCount, 1);
assert.equal(supDirectory.rows[0]?.controlStatus, 'OK');
console.log('  PASS: Directorio de Proveedores verificado (N.º productos en catálogo = 1, Control = OK).');

console.log('\n======================================================================');
console.log('RESULTADO FINAL: TODAS LAS PRUEBAS DE LA FASE 2 PASARON AL 100%');
console.log('======================================================================');

