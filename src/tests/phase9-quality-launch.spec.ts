import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { type AuthenticatedTenantContext } from '../domain/policies/rbac.policy.ts';
import { EnterpriseSaaSEngine } from '../domain/services/enterprise-saas.service.ts';
import { CatalogsAndConfigService } from '../domain/services/catalogs-config.service.ts';
import { InventoryAndCostingService } from '../domain/services/inventory-costing.service.ts';
import { SalesAndPosService } from '../domain/services/sales-pos.service.ts';
import { FinanceAndTreasuryService } from '../domain/services/finance-treasury.service.ts';
import { BusinessIntelligenceService } from '../domain/services/business-intelligence.service.ts';
import { excelRound } from '../domain/calculations/financial-engine.ts';

console.log('======================================================================');
console.log('MI NEGOCIO PRO 360 — PRUEBAS DE CALIDAD, CARGA Y LANZAMIENTO (FASE 9)');
console.log('======================================================================\n');

// 1. Prueba de precisión decimal y redondeo monetario (evitar errores binarios 0.1 + 0.2)
const sum = excelRound(0.1 + 0.2, 2);
assert.equal(sum, 0.3);
const taxCalc = excelRound(133.335 * 0.15, 2);
assert.equal(taxCalc, 20);
console.log('PASS [Precisión Decimal]: Redondeo financiero exacto sin deriva binaria.');

// 2. Prueba de Carga Multi-Tenant (100 empresas operando simultáneamente sin cruce de datos)
const TENANT_COUNT = 100;
const engine = new EnterpriseSaaSEngine();
const catalogService = new CatalogsAndConfigService(engine);
const inventoryService = new InventoryAndCostingService(engine);
const salesService = new SalesAndPosService(engine);
const financeService = new FinanceAndTreasuryService(engine);
const biService = new BusinessIntelligenceService(
  engine,
  inventoryService,
  financeService,
  catalogService,
);

const latenciesMs: number[] = [];
const startLoad = performance.now();
let t1PmId = '';
let t1AccId = '';
let t1TaxId = '';

for (let i = 1; i <= TENANT_COUNT; i++) {
  const tStart = performance.now();
  const ctx: AuthenticatedTenantContext = {
    userId: `owner-load-${i}`,
    email: `owner${i}@negocio${i}.com`,
    platformRole: 'USER',
    tenantId: `tenant-load-${i}`,
    tenantSlug: `negocio-${i}`,
    tenantStatus: 'ACTIVE',
    roleCode: 'TENANT_OWNER',
  };

  const seeded = catalogService.seedDefaultConfigurationForTenant(ctx, {
    tradeName: `Negocio Carga ${i}`,
    currencyCode: 'NIO',
    operatingYear: 2026,
    analysisMonth: 11,
  });

  const accCaja = seeded.financialAccounts[0]!;
  const pmEfectivo = seeded.paymentMethods[0]!;
  const taxZero = seeded.taxProfiles[0]!;
  const cat = seeded.productCategories[0]!;
  if (i === 1) {
    t1PmId = pmEfectivo.id;
    t1AccId = accCaja.id;
    t1TaxId = taxZero.id;
  }

  const sup = engine.createSupplier(ctx, {
    id: `sup-${i}`,
    code: 'PRV-01',
    name: `Proveedor ${i}`,
  });

  const cli = engine.createCustomer(ctx, {
    id: `cli-${i}`,
    code: 'CLI-01',
    name: `Cliente ${i}`,
    customerType: 'REGISTERED',
  });

  const prod = engine.createProduct(ctx, {
    id: `prod-${i}`,
    sku: `SKU-${i}`,
    name: `Producto ${i}`,
    categoryId: cat.id,
    type: 'PRODUCT',
    unitName: 'Unidad',
    salePrice: 150 + i,
    referenceCost: 80,
    preferredSupplierId: sup.id,
    minimumStock: 5,
    openingStockQuantity: 20,
    openingUnitCost: 80,
  });

  // Venta de 10 unidades al precio (150 + i) -> ingresa >= 1,510 a Caja
  const sale = engine.registerSale(ctx, {
    id: `sale-${i}`,
    saleNumber: `VTA-${i}`,
    customerId: cli.id,
    date: '2026-11-05',
    paymentCondition: 'CASH',
    paymentMethodId: pmEfectivo.id,
    financialAccountId: accCaja.id,
    lines: [
      {
        productId: prod.id,
        quantity: 10,
        unitPrice: 150 + i,
        discountPercentage: 0,
        taxProfileId: taxZero.id,
      },
    ],
  });

  assert.equal(sale.grandTotal, excelRound(10 * (150 + i), 2));

  // Compra de 10 unidades a costo 110 -> egresa 1,100 de Caja (saldo final >= 410 > 0)
  inventoryService.registerPurchaseWithCostingRecalculation(ctx, {
    id: `pur-${i}`,
    purchaseNumber: `FAC-${i}`,
    supplierId: sup.id,
    date: '2026-11-10',
    productId: prod.id,
    quantity: 10,
    unitCost: 110,
    taxProfileId: taxZero.id,
    paymentCondition: 'CASH',
    financialAccountId: accCaja.id,
  });

  // Verificar conciliación 31/31 y aislamiento estricto de datos
  const recon = biService.getReconciliationCenterReport(ctx);
  const bad = recon.controls.filter((c) => c.state !== 'OK');
  assert.equal(
    recon.reviewCount,
    0,
    `Tenant ${i} tuvo ${recon.reviewCount} controles por revisar: ${bad.map((c) => `${c.code}:${c.state}(${c.difference})`).join(', ')}`,
  );
  assert.equal(recon.okCount, 31);

  // Verificar que los productos visibles pertenecen únicamente al tenant i
  const visibleProducts = engine.listProducts(ctx);
  assert.equal(visibleProducts.length, 1);
  assert.equal(visibleProducts[0]!.tenantId, ctx.tenantId);

  latenciesMs.push(performance.now() - tStart);
}

const totalLoadMs = performance.now() - startLoad;
const sortedLatencies = [...latenciesMs].sort((a, b) => a - b);
const avgMs = latenciesMs.reduce((acc, v) => acc + v, 0) / latenciesMs.length;
const p95Ms = sortedLatencies[Math.floor(sortedLatencies.length * 0.95)] ?? 0;

console.log(
  `PASS [Carga Multi-Tenant]: ${TENANT_COUNT} empresas procesadas en ${totalLoadMs.toFixed(1)} ms ` +
    `(Promedio: ${avgMs.toFixed(2)} ms/empresa, P95: ${p95Ms.toFixed(2)} ms, 0 fugas, 31/31 controles OK).`,
);

// 3. Prueba de intento de acceso horizontal entre Tenant 1 y Tenant 2 en el mismo motor cargado
const ctxT1: AuthenticatedTenantContext = {
  userId: 'owner-load-1',
  email: 'owner1@negocio1.com',
  platformRole: 'USER',
  tenantId: 'tenant-load-1',
  tenantSlug: 'negocio-1',
  tenantStatus: 'ACTIVE',
  roleCode: 'TENANT_OWNER',
};
assert.throws(
  () => {
    const prod2 = engine.listProducts(ctxT1).find((p) => p.id === 'prod-2');
    if (!prod2) {
      throw new Error('Acceso horizontal denegado: producto de otro tenant no visible');
    }
  },
  /Acceso horizontal denegado/,
  'Un tenant no debe poder leer productos de otro tenant.',
);
// Intentar vender un producto de Tenant 2 desde Tenant 1 debe ser rechazado por aislamiento
assert.throws(
  () =>
    engine.registerSale(ctxT1, {
      id: 'sale-cross-tenant',
      saleNumber: 'VTA-CROSS',
      customerId: 'cli-1',
      date: '2026-11-11',
      paymentCondition: 'CASH',
      paymentMethodId: t1PmId,
      financialAccountId: t1AccId,
      lines: [
        {
          productId: 'prod-2',
          quantity: 1,
          unitPrice: 100,
          taxProfileId: t1TaxId,
        },
      ],
    }),
  /no encontrado|tenant|pertenece/i,
);
console.log('PASS [Seguridad Horizontal]: Bloqueo confirmado de acceso y mutación cruzada entre tenants bajo carga.');

// 4. Prueba #16: Anulación de venta restaura estado y mantiene integridad contable
// Registramos una venta adicional en Tenant 1 para que al anular sale-1 la caja no quede en negativo por la compra previa
engine.registerSale(ctxT1, {
  id: 'sale-extra-1',
  saleNumber: 'VTA-EXTRA-1',
  customerId: 'cli-1',
  date: '2026-11-12',
  paymentCondition: 'CASH',
  paymentMethodId: t1PmId,
  financialAccountId: t1AccId,
  lines: [{ productId: 'prod-1', quantity: 10, unitPrice: 151, discountPercentage: 0, taxProfileId: t1TaxId }],
});
const saleToVoid = engine.voidSale(ctxT1, 'sale-1', 'Error de digitación en prueba QA');
assert.equal(saleToVoid.status, 'VOIDED');
const reconAfterVoid = biService.getReconciliationCenterReport(ctxT1);
assert.equal(reconAfterVoid.reviewCount, 0);
assert.equal(reconAfterVoid.okCount, 31);
console.log('PASS [Prueba #16]: Anulación de venta preserva 31/31 controles conciliados.');
