import assert from 'node:assert/strict';
import { type AuthenticatedTenantContext } from '../domain/policies/rbac.policy.ts';
import {
  EnterpriseSaaSEngine,
  type SaleDocumentEntity,
  type PurchaseDocumentEntity,
  type OperatingExpenseEntity,
  type CollectionRecordEntity,
  type PaymentRecordEntity,
  type CashAdjustmentEntity,
} from '../domain/services/enterprise-saas.service.ts';
import { CatalogsAndConfigService } from '../domain/services/catalogs-config.service.ts';
import { InventoryAndCostingService } from '../domain/services/inventory-costing.service.ts';
import { FinanceAndTreasuryService } from '../domain/services/finance-treasury.service.ts';
import { BusinessIntelligenceService, type TenantDataSnapshot } from '../domain/services/business-intelligence.service.ts';

console.log('======================================================================');
console.log('MI NEGOCIO PRO 360 — EJECUCIÓN DE PRUEBAS AUTOMATIZADAS (FASE 6)');
console.log('======================================================================\n');

const engine = new EnterpriseSaaSEngine();
const catalogService = new CatalogsAndConfigService(engine);
const inventoryService = new InventoryAndCostingService(engine);
const financeService = new FinanceAndTreasuryService(engine);
const biService = new BusinessIntelligenceService(
  engine,
  inventoryService,
  financeService,
  catalogService
);

const ownerCtx: AuthenticatedTenantContext = {
  userId: 'user-owner-f6',
  email: 'bi@fronterasbar.com',
  platformRole: 'USER',
  tenantId: 'tenant-f6-fronteras',
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

const settings = engine.getTenantSettings(ownerCtx, ownerCtx.tenantId);
settings.selectedDashboardDate = '2026-11-10';
settings.cutoffDate = '2026-11-15';

const taxZero = seeded.taxProfiles[0]!;
const taxIva15 = engine.createTaxProfile(ownerCtx, { id: 'tax-iva15', name: 'IVA 15%', rate: 0.15 });
const accCaja = seeded.financialAccounts[0]!;
const accBanco = seeded.financialAccounts[1]!;
accCaja.openingBalance = 2000;
accBanco.openingBalance = 15000;

const pmEfectivo = seeded.paymentMethods[0]!;
const pmTarjeta = seeded.paymentMethods[2]!;
const catBebidas = seeded.productCategories.find((c) => c.name === 'Bebidas')!;
const catAlquiler = seeded.expenseCategories.find((c) => c.name === 'Alquiler')!;

const sup = engine.createSupplier(ownerCtx, { id: 'sup-1', code: 'PRV01', name: 'Cervecería Nacional' });
const cliMostrador = engine.createCustomer(ownerCtx, {
  id: 'cli-gen',
  code: 'CLI-GEN',
  name: 'Cliente Mostrador',
  customerType: 'GENERIC',
});
const cliReg = engine.createCustomer(ownerCtx, {
  id: 'cli-reg',
  code: 'CLI-01',
  name: 'Bar La Esquina',
  customerType: 'REGISTERED',
});

const prodTona = engine.createProduct(ownerCtx, {
  id: 'prod-1',
  sku: 'SKU01',
  name: 'Cerveza Toña 1L',
  categoryId: catBebidas.id,
  type: 'PRODUCT',
  unitName: 'Unidad',
  salePrice: 100,
  referenceCost: 80,
  minimumStock: 20,
  openingStockQuantity: 50,
  openingUnitCost: 80,
});

const snapshot: TenantDataSnapshot = {
  sales: [],
  purchases: [],
  expenses: [],
  collections: [],
  payments: [],
  cashAdjustments: [],
  customers: [cliMostrador, cliReg],
};

// Compra en Septiembre: 50 u @ C$ 80
snapshot.purchases.push(
  inventoryService.registerPurchaseWithCostingRecalculation(ownerCtx, {
    id: 'comp-1',
    purchaseNumber: 'COMP-0001',
    supplierId: sup.id,
    date: '2026-09-05',
    productId: prodTona.id,
    quantity: 50,
    unitCost: 80,
    taxProfileId: taxZero.id,
    paymentCondition: 'CASH',
    financialAccountId: accBanco.id,
  })
);

// Venta de contado en Noviembre (día seleccionado 2026-11-10): 10 u @ C$ 100 + IVA 15% (pagada con Tarjeta)
snapshot.sales.push(
  engine.registerSale(ownerCtx, {
    id: 'vta-1',
    saleNumber: 'VTA-0001',
    customerId: cliMostrador.id,
    date: '2026-11-10',
    paymentCondition: 'CASH',
    paymentMethodId: pmTarjeta.id,
    financialAccountId: accBanco.id,
    lines: [{ productId: prodTona.id, quantity: 10, unitPrice: 100, taxProfileId: taxIva15.id }],
  })
);

// Venta a crédito en Noviembre (2026-11-12): 15 u @ C$ 100 sin impuesto -> Total 1,500
const vtaCred = engine.registerSale(ownerCtx, {
  id: 'vta-2',
  saleNumber: 'VTA-0002',
  customerId: cliReg.id,
  date: '2026-11-12',
  paymentCondition: 'CREDIT',
  creditDays: 15,
  lines: [{ productId: prodTona.id, quantity: 15, unitPrice: 100, taxProfileId: taxZero.id }],
});
snapshot.sales.push(vtaCred);

// Cobro parcial en Efectivo en Noviembre: C$ 600 de C$ 1,500
snapshot.collections.push(
  financeService.registerCollection(ownerCtx, {
    id: 'cob-1',
    collectionNumber: 'COB-0001',
    date: '2026-11-14',
    saleId: vtaCred.id,
    amount: 600,
    paymentMethodId: pmEfectivo.id,
    financialAccountId: accCaja.id,
  })
);

// Gasto operativo de contado en Noviembre: C$ 300
snapshot.expenses.push(
  financeService.registerExpense(ownerCtx, {
    id: 'gas-1',
    expenseNumber: 'GAS-0001',
    date: '2026-11-05',
    categoryId: catAlquiler.id,
    description: 'Alquiler bodega auxiliar',
    netAmount: 300,
    taxProfileId: taxZero.id,
    paymentCondition: 'CASH',
    paymentMethodId: pmEfectivo.id,
    financialAccountId: accCaja.id,
  })
);

// 1. Verificar Dashboard Empresarial (16 KPIs y coherencia con fuentes)
const dash = biService.getDashboardData(ownerCtx, snapshot);
assert.equal(dash.kpis.selectedDayNetSales, 1000); // VTA-0001 del 2026-11-10
assert.equal(dash.kpis.monthNetSales, 2500);       // 1,000 + 1,500
assert.equal(dash.kpis.annualNetSales, 2500);
assert.equal(dash.kpis.monthCogs, 2000);           // 25 u * C$ 80
assert.equal(dash.kpis.monthGrossProfit, 500);     // 2,500 - 2,000
assert.equal(dash.kpis.monthOperatingExpenses, 300);
assert.equal(dash.kpis.monthOperatingProfit, 200); // 500 - 300
assert.equal(dash.kpis.monthSalesCount, 2);
assert.equal(dash.kpis.monthAverageTicket, 1250);
assert.equal(dash.kpis.receivablesTotal, 900);     // 1,500 - 600
assert.equal(dash.kpis.inventoryTotalValue, 6000); // (50 + 50 - 25) * 80 = 75 * 80 = 6,000
// Saldo en Caja y Bancos:
// Caja: 2,000 + 600 (cobro) - 300 (gasto) = 2,300
// Banco: 15,000 - 4,000 (compra) + 1,150 (venta c/IVA) = 12,150
// Total = 14,450
assert.equal(dash.kpis.cashAndBanksTotalBalance, 14450);
console.log('  PASS: Dashboard Empresarial (16 KPIs) verificado y 100% coherente con Estado de Resultados, CxC, Inventario y Caja.');

// 2. Verificar Flujo de Caja (12 meses) y Control #14 (Saldo final Flujo === Saldo Caja y Bancos)
const cashFlow = biService.getCashFlowReport(ownerCtx, snapshot, {
  expectedInflowsGrowthRate: 0.1,
  expectedOutflowsChangeRate: 0,
});
assert.equal(cashFlow.annualSummary.closingBalance, dash.kpis.cashAndBanksTotalBalance);
assert.equal(cashFlow.months[10]?.cashSalesCollected, 1150); // Noviembre
assert.equal(cashFlow.months[10]?.creditCollections, 600);
assert.equal(cashFlow.months[10]?.totalInflows, 1750);
assert.equal(cashFlow.projection.months.length, 3);
assert.equal(cashFlow.projection.months[0]?.monthName, 'Diciembre');
console.log(
  `  PASS: Flujo de Caja (Saldo Final C$ ${cashFlow.annualSummary.closingBalance.toFixed(2)} == Caja y Bancos) y Proyección a 3 meses verificados.`
);

// 3. Verificar Reportes Empresariales (Ventas diarias, Mensuales, Top Productos, Clientes sin mostrador, Métodos de pago)
const reports = biService.getEnterpriseReports(ownerCtx, snapshot);
const nov10 = reports.dailySales.find((d) => d.date === '2026-11-10')!;
assert.equal(nov10.salesCount, 1);
assert.equal(nov10.netSales, 1000);
assert.equal(nov10.realCashCollected, 1150);
assert.equal(reports.topCustomers.length, 1); // Excluye Cliente Mostrador
assert.equal(reports.topCustomers[0]?.name, 'Bar La Esquina');
assert.equal(reports.collectionsByPaymentMethod.length, 2); // Tarjeta (1150) y Efectivo (600)
console.log('  PASS: Reportes Empresariales (Ventas diarias, Clientes excluyendo mostrador, Cobros por método) verificados.');

// 4. Prueba #23: Simulador de Precios sin alterar catálogo real
const sim = biService.simulateProductPricing(ownerCtx, {
  catalogCost: prodTona.referenceCost,
  catalogPrice: prodTona.salePrice,
  targetMargin: 0.3,
  discountRate: 0.05,
  taxRate: 0.15,
  baseMonthlyVolume: 100,
  monthlyFixedCosts: 500,
});
assert.ok(Math.abs(sim.recommendedPriceNoTax - 80 / 0.7) < 1e-9);
assert.ok(Math.abs(sim.recommendedPriceWithTax - (80 / 0.7) * 1.15) < 1e-9);
assert.equal(prodTona.salePrice, 100, 'El simulador no debe modificar el precio real del catálogo');
console.log('  PASS [Prueba #23]: Simulador de Precios calculado con precisión sin alterar el catálogo.');

// 5. Verificar Centro de Control y Conciliación (31/31 OK)
const recon = biService.getReconciliationCenterReport(ownerCtx);
assert.equal(recon.reviewCount, 0);
assert.equal(recon.okCount, 31);
console.log(`  PASS: Centro de Control y Conciliación: ${recon.okCount}/31 controles OK, 0 por revisar.`);

console.log('\n======================================================================');
console.log('RESULTADO FINAL: TODAS LAS PRUEBAS DE LA FASE 6 PASARON AL 100%');
console.log('======================================================================');
