import assert from 'node:assert/strict';
import { type AuthenticatedTenantContext } from '../domain/policies/rbac.policy.ts';
import { EnterpriseSaaSEngine } from '../domain/services/enterprise-saas.service.ts';
import { CatalogsAndConfigService } from '../domain/services/catalogs-config.service.ts';
import { InventoryAndCostingService } from '../domain/services/inventory-costing.service.ts';
import { FinanceAndTreasuryService } from '../domain/services/finance-treasury.service.ts';
import {
  ExcelImportService,
  type ExcelImportWorkbookPayload,
  type TenantCatalogLookup,
} from '../domain/services/excel-import.service.ts';

console.log('======================================================================');
console.log('MI NEGOCIO PRO 360 — EJECUCIÓN DE PRUEBAS AUTOMATIZADAS (FASE 8)');
console.log('======================================================================\n');

const engine = new EnterpriseSaaSEngine();
const catalogService = new CatalogsAndConfigService(engine);
const inventoryService = new InventoryAndCostingService(engine);
const financeService = new FinanceAndTreasuryService(engine);
const importService = new ExcelImportService(engine, inventoryService, financeService);

const ownerCtx: AuthenticatedTenantContext = {
  userId: 'user-owner-f8',
  email: 'migracion@fronterasbar.com',
  platformRole: 'USER',
  tenantId: 'tenant-f8-fronteras',
  tenantSlug: 'fronteras-bar',
  tenantStatus: 'ACTIVE',
  roleCode: 'TENANT_OWNER',
};

const seeded = catalogService.seedDefaultConfigurationForTenant(ownerCtx, {
  tradeName: 'Fronteras Bar',
  currencyCode: 'NIO',
  operatingYear: 2026,
  analysisMonth: 11,
});
seeded.financialAccounts[0]!.openingBalance = 5000;
seeded.financialAccounts[1]!.openingBalance = 10000;

const lookup: TenantCatalogLookup = {
  supplierIdsByName: new Map(),
  customerIdsByName: new Map(),
  productCategoryIdsByName: new Map(seeded.productCategories.map((c) => [c.name, c.id])),
  expenseCategoryIdsByName: new Map(seeded.expenseCategories.map((c) => [c.name, c.id])),
  taxProfilesByName: new Map(seeded.taxProfiles.map((t) => [t.name, { id: t.id, rate: t.rate }])),
  accountIdsByName: new Map(seeded.financialAccounts.map((a) => [a.name, a.id])),
  paymentMethodIdsByName: new Map(seeded.paymentMethods.map((m) => [m.name, m.id])),
};

// 1. Detectar errores de referencias faltantes en Vista Previa antes de importar
const badPayload: ExcelImportWorkbookPayload = {
  products: [
    {
      sku: 'SKU99',
      name: 'Producto Sin Categoría',
      categoryName: 'Categoría Inexistente',
      type: 'PRODUCT',
      unitName: 'Unidad',
      salePrice: 50,
      referenceCost: 20,
      minimumStock: 5,
    },
  ],
};
const badPreview = importService.analyzeAndPreviewImport(ownerCtx, badPayload, lookup);
assert.equal(badPreview.canCommit, false);
assert.equal(badPreview.issues.length, 1);
assert.throws(
  () => importService.executeValidatedImport(ownerCtx, badPayload, lookup),
  /Importación abortada por errores de validación/
);
console.log('  PASS: Detección de referencias faltantes en vista previa y bloqueo de importación inválida.');

// 2. Payload válido equivalente a un libro MI_NEGOCIO_PRO_360 con datos reales + una discrepancia en fórmula Excel
const validPayload: ExcelImportWorkbookPayload = {
  suppliers: [{ code: 'PRV01', name: 'Cervecería Nacional', contactName: 'Ana López' }],
  customers: [{ code: 'CLI01', name: 'Cliente Mostrador', customerType: 'GENERIC' }],
  products: [
    {
      sku: 'SKU01',
      name: 'Cerveza Toña 1L',
      description: 'Cerveza toña de litro',
      categoryName: 'Bebidas',
      type: 'PRODUCT',
      unitName: 'Unidad',
      salePrice: 100,
      referenceCost: 80,
      preferredSupplierName: 'Cervecería Nacional',
      minimumStock: 48,
    },
  ],
  openingBalances: [{ sku: 'SKU01', quantity: 50, unitCost: 80 }],
  purchases: [
    {
      purchaseNumber: 'COMP-0001',
      date: '2026-10-10',
      supplierName: 'Cervecería Nacional',
      sku: 'SKU01',
      quantity: 50,
      unitCost: 90,
      taxProfileName: 'Sin impuesto',
      paymentCondition: 'CASH',
      accountName: 'Banco principal',
      excelReportedTotal: 4500, // Exacto: 50 * 90 = 4,500
    },
  ],
  expenses: [
    {
      expenseNumber: 'GAS-0001',
      date: '2026-10-15',
      categoryName: 'Alquiler',
      description: 'Alquiler mes Octubre',
      netAmount: 2000,
      taxProfileName: 'Sin impuesto',
      paymentCondition: 'CASH',
      paymentMethodName: 'Efectivo',
      accountName: 'Caja general',
      excelReportedTotal: 2000,
    },
  ],
  sales: [
    {
      saleNumber: 'VTA-0001',
      date: '2026-11-02',
      customerName: 'Cliente Mostrador',
      paymentCondition: 'CASH',
      paymentMethodName: 'Efectivo',
      accountName: 'Caja general',
      lines: [
        {
          sku: 'SKU01',
          quantity: 10,
          unitPrice: 100,
          taxProfileName: 'Sin impuesto',
          excelReportedLineTotal: 995, // Discrepancia intencional: Excel decía 995, servidor recalcula 1,000!
        },
      ],
    },
  ],
};

const preview = importService.analyzeAndPreviewImport(ownerCtx, validPayload, lookup);
assert.equal(preview.canCommit, true);
assert.equal(preview.detectedSheets.length, 7);
assert.equal(preview.reconciliationDiscrepancies.length, 1);
assert.equal(preview.reconciliationDiscrepancies[0]?.serverRecalculatedValue, 1000);
assert.equal(preview.reconciliationDiscrepancies[0]?.difference, -5);
console.log(
  '  PASS: Detección de discrepancias entre valor almacenado en Excel (995) y recálculo del servidor (1,000).'
);

// Ejecutar importación por primera vez
const firstImport = importService.executeValidatedImport(ownerCtx, validPayload, lookup);
assert.equal(firstImport.committed, true);
assert.equal(firstImport.inserted.suppliers, 1);
assert.equal(firstImport.inserted.customers, 1);
assert.equal(firstImport.inserted.products, 1);
assert.equal(firstImport.inserted.openingBalancesUpdated, 1);
assert.equal(firstImport.inserted.purchases, 1);
assert.equal(firstImport.inserted.expenses, 1);
assert.equal(firstImport.inserted.sales, 1);
console.log('  PASS: Primera importación transaccional completada (7 hojas migradas).');

// Prueba #29: Importación repetida del mismo archivo NO debe duplicar registros
const secondImport = importService.executeValidatedImport(ownerCtx, validPayload, lookup);
assert.equal(secondImport.committed, true);
assert.equal(secondImport.inserted.suppliers, 0);
assert.equal(secondImport.inserted.customers, 0);
assert.equal(secondImport.inserted.products, 0);
assert.equal(secondImport.inserted.purchases, 0);
assert.equal(secondImport.inserted.expenses, 0);
assert.equal(secondImport.inserted.sales, 0);
assert.equal(secondImport.skippedDuplicates.suppliers, 1);
assert.equal(secondImport.skippedDuplicates.customers, 1);
assert.equal(secondImport.skippedDuplicates.products, 1);
assert.equal(secondImport.skippedDuplicates.purchases, 1);
assert.equal(secondImport.skippedDuplicates.expenses, 1);
assert.equal(secondImport.skippedDuplicates.sales, 1);
console.log('  PASS [Prueba #29]: Importación repetida omite duplicados de forma idempotente sin alterar saldos.');

// Verificar que tras la migración el stock de SKU01 es 50 + 50 - 10 = 90 y los 31 controles están OK
const prodList = engine.listProducts(ownerCtx);
assert.equal(prodList.length, 1);
const costing = engine.getProductCostingSummary(ownerCtx, prodList[0]!.id);
assert.equal(costing.finalStock, 90);
// CPP Noviembre (arrastrado de Octubre: (50*80 + 50*90)/100 = 8,500/100 = 85.00)
assert.equal(costing.finalAverageCost, 85);

const recon = engine.executeReconciliationCenter(ownerCtx);
assert.equal(recon.reviewCount, 0);
assert.equal(recon.okCount, 31);
console.log('  PASS: Post-migración conciliada al 100% (Stock=90, CPP=85.00, 31/31 Controles OK).');

console.log('\n======================================================================');
console.log('RESULTADO FINAL: TODAS LAS PRUEBAS DE LA FASE 8 PASARON AL 100%');
console.log('======================================================================');
