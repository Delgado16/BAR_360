import assert from 'node:assert/strict';
import { type AuthenticatedTenantContext } from '../domain/policies/rbac.policy.ts';
import { EnterpriseSaaSEngine, type SaleDocumentEntity } from '../domain/services/enterprise-saas.service.ts';
import { CatalogsAndConfigService } from '../domain/services/catalogs-config.service.ts';
import { InventoryAndCostingService } from '../domain/services/inventory-costing.service.ts';
import { SalesAndPosService } from '../domain/services/sales-pos.service.ts';

console.log('======================================================================');
console.log('MI NEGOCIO PRO 360 — EJECUCIÓN DE PRUEBAS AUTOMATIZADAS (FASES 3 Y 4)');
console.log('======================================================================\n');

const engine = new EnterpriseSaaSEngine();
const catalogService = new CatalogsAndConfigService(engine);
const inventoryService = new InventoryAndCostingService(engine);
const salesService = new SalesAndPosService(engine);

const ownerCtx: AuthenticatedTenantContext = {
  userId: 'user-owner-f34',
  email: 'propietario@fronterasbar.com',
  platformRole: 'USER',
  tenantId: 'tenant-f34-fronteras',
  tenantSlug: 'fronteras-bar',
  tenantStatus: 'ACTIVE',
  roleCode: 'TENANT_OWNER',
};

// 1. Sembrar configuración base ("Fronteras Bar", Año 2026) y perfil IVA 15%
const seeded = catalogService.seedDefaultConfigurationForTenant(ownerCtx, {
  tradeName: 'Fronteras Bar',
  currencyCode: 'NIO',
  operatingYear: 2026,
  analysisMonth: 11,
});

const taxZero = seeded.taxProfiles[0]!;
const taxIva15 = engine.createTaxProfile(ownerCtx, {
  id: 'tax-iva-15',
  name: 'IVA 15%',
  rate: 0.15,
});
const accCaja = seeded.financialAccounts[0]!;
const accBanco = seeded.financialAccounts[1]!;
const pmEfectivo = seeded.paymentMethods[0]!;
const catBebidas = seeded.productCategories.find((c) => c.name === 'Bebidas')!;
const catAlimentos = seeded.productCategories.find((c) => c.name === 'Alimentos')!;
const catServicios = seeded.productCategories.find((c) => c.name === 'Servicios')!;

const supCerveceria = engine.createSupplier(ownerCtx, {
  id: 'sup-cerv',
  code: 'PRV-01',
  name: 'Cervecería Nacional',
});
const cliMostrador = engine.createCustomer(ownerCtx, {
  id: 'cli-mostrador',
  code: 'CLI-GEN',
  name: 'Cliente Mostrador',
  customerType: 'GENERIC',
});
const cliHotel = engine.createCustomer(ownerCtx, {
  id: 'cli-hotel',
  code: 'CLI-01',
  name: 'Hotel Colonial',
  customerType: 'REGISTERED',
});

// 2. Crear productos y un servicio
// SKU01: Sin movimientos iniciales para probar Prueba #19 (Inventario sin movimientos)
const prodTona = engine.createProduct(ownerCtx, {
  id: 'prod-sku01',
  sku: 'SKU01',
  name: 'Cerveza Toña 1L',
  categoryId: catBebidas.id,
  type: 'PRODUCT',
  unitName: 'Unidad',
  salePrice: 100,
  referenceCost: 80,
  preferredSupplierId: supCerveceria.id,
  minimumStock: 48,
  openingStockQuantity: 0,
  openingUnitCost: 0,
});

// SKU02: Para probar múltiples líneas
const prodNachos = engine.createProduct(ownerCtx, {
  id: 'prod-sku02',
  sku: 'SKU02',
  name: 'Nachos Especiales',
  categoryId: catAlimentos.id,
  type: 'PRODUCT',
  unitName: 'Unidad',
  salePrice: 150,
  referenceCost: 70,
  minimumStock: 10,
  openingStockQuantity: 30,
  openingUnitCost: 70,
});

// SRV01: Producto de tipo Servicio (Prueba #20)
const prodEvento = engine.createProduct(ownerCtx, {
  id: 'prod-srv01',
  sku: 'SRV01',
  name: 'Música en Vivo / Descorche',
  categoryId: catServicios.id,
  type: 'SERVICE',
  unitName: 'Servicio',
  salePrice: 400,
  referenceCost: 120, // Costo de referencia del servicio
  minimumStock: 0,
  openingStockQuantity: 0,
  openingUnitCost: 0,
});

// Prueba #19: Inventario sin movimientos (SKU01 con stock 0 debe tener CPP = 80 de catálogo en los 12 meses)
const sku01NoMov = engine.getProductCostingSummary(ownerCtx, prodTona.id);
assert.equal(sku01NoMov.finalStock, 0);
assert.equal(sku01NoMov.finalAverageCost, 80);
assert.equal(sku01NoMov.inventoryState, 'OUT_OF_STOCK');
assert.equal(sku01NoMov.suggestedReplenishment, 96);
console.log('  PASS [Prueba #19]: Inventario sin movimientos conserva costo de referencia (80) y sugiere reposición (96).');

// 3. Configurar Saldo Inicial para SKU01: 20 unidades @ C$ 80.00 = C$ 1,600.00
inventoryService.setOpeningBalance(ownerCtx, prodTona.id, 20, 80);

// Prueba #6: Compra de contado en Enero (30 unidades @ C$ 90.00 sin descuento, con IVA 15% RECUPERABLE)
// Como el impuesto es RECUPERABLE (cfg_ImpCosto = 0):
// Subtotal neto = 2,700.00 | Impuesto = 405.00 | Total pagado = 3,105.00 | Costo p/ inventario = 2,700.00
// Nuevo CPP Enero de SKU01 = (1,600 + 2,700) / (20 + 30) = 4,300 / 50 = C$ 86.00
const compEne = inventoryService.registerPurchaseWithCostingRecalculation(ownerCtx, {
  id: 'comp-ene-1',
  purchaseNumber: 'COMP-0001',
  supplierId: supCerveceria.id,
  date: '2026-01-10',
  productId: prodTona.id,
  quantity: 30,
  unitCost: 90,
  taxProfileId: taxIva15.id,
  paymentCondition: 'CASH',
  financialAccountId: accBanco.id,
});

assert.equal(compEne.netSubtotal, 2700);
assert.equal(compEne.taxAmount, 405);
assert.equal(compEne.grandTotal, 3105);
assert.equal(compEne.inventoryCapitalizedCost, 2700);

const cppAfterJanPurchase = engine.getProductCostingSummary(ownerCtx, prodTona.id);
assert.equal(cppAfterJanPurchase.monthlyBreakdown[0]?.weightedAverageCost, 86);
assert.equal(cppAfterJanPurchase.monthlyBreakdown[1]?.weightedAverageCost, 86); // Arrastrado a Febrero
console.log('  PASS [Prueba #6]: Compra de contado con impuesto recuperable capitaliza subtotal neto (2,700) y calcula CPP Enero = C$ 86.00.');

// Prueba #7: Compra a crédito en Marzo (50 unidades @ C$ 100.00 con 5% descuento, sin impuesto)
// Neto = 50 * 100 * 0.95 = C$ 4,750.00 (Costo unitario efectivo = 95.00). Genera obligación en Cuentas por Pagar.
const compMar = inventoryService.registerPurchaseWithCostingRecalculation(ownerCtx, {
  id: 'comp-mar-1',
  purchaseNumber: 'COMP-0002',
  supplierId: supCerveceria.id,
  date: '2026-03-05',
  productId: prodTona.id,
  quantity: 50,
  unitCost: 100,
  discountPercentage: 0.05,
  taxProfileId: taxZero.id,
  paymentCondition: 'CREDIT',
});
assert.equal(compMar.grandTotal, 4750);
assert.equal(compMar.dueDate, '2026-04-04'); // +30 días por defecto
const cxpAfterCompMar = engine.getAccountsPayableReport(ownerCtx);
assert.equal(cxpAfterCompMar.length, 1);
assert.equal(cxpAfterCompMar[0]?.originalAmount, 4750);
console.log('  PASS [Prueba #7]: Compra a crédito con descuento genera Cuenta por Pagar por C$ 4,750.00 con vencimiento a 30 días.');

// Pruebas #15 y #16: Ajuste positivo (sobrante) y Ajuste negativo (merma) en Enero valorados al CPP del mes (86.00)
const adjPosEne = inventoryService.registerInventoryAdjustmentWithValuation(ownerCtx, {
  id: 'aji-pos-1',
  adjustmentNumber: 'AJI-0001',
  date: '2026-01-15',
  productId: prodTona.id,
  isPositive: true,
  quantity: 2,
  reason: 'Sobrante en conteo físico de bodega',
});
assert.equal(adjPosEne.appliedMonthlyAvgCost, 86);
assert.equal(adjPosEne.totalValuation, 172); // +2 * 86

const adjNegEne = inventoryService.registerInventoryAdjustmentWithValuation(ownerCtx, {
  id: 'aji-neg-1',
  adjustmentNumber: 'AJI-0002',
  date: '2026-01-20',
  productId: prodTona.id,
  isPositive: false,
  quantity: 4,
  reason: 'Merma por rotura de botellas',
});
assert.equal(adjNegEne.appliedMonthlyAvgCost, 86);
assert.equal(adjNegEne.totalValuation, -344); // -4 * 86
console.log('  PASS [Pruebas #15 y #16]: Ajustes positivo (+172) y negativo (-344) valorados exactamente al CPP del mes (C$ 86.00).');

// Prueba #1, #3, #4, #5 y #20: Venta de contado multi-línea en Febrero con Producto1, Producto2 (con descuento e IVA 15%) y Servicio
// En Febrero antes de compras de Febrero, el stock de SKU01 es: 20 (ini) + 30 (comp Ene) + 2 (aj+) - 4 (aj-) = 48 u @ C$ 86.00.
const recordedSales: SaleDocumentEntity[] = [];

const saleFebContado = engine.registerSale(ownerCtx, {
  id: 'vta-feb-1',
  saleNumber: 'VTA-0001',
  documentNumber: 'FAC-0001',
  customerId: cliMostrador.id,
  date: '2026-02-10',
  paymentCondition: 'CASH',
  paymentMethodId: pmEfectivo.id,
  financialAccountId: accCaja.id,
  lines: [
    // Línea 1: 10 u de SKU01 @ C$ 100, 10% descuento, IVA 15%
    // Neto = 900.00 | IVA = 135.00 | Total = 1,035.00 | Costo hist. = 10 * 86 = 860.00 | Utilidad = 40.00
    {
      productId: prodTona.id,
      quantity: 10,
      unitPrice: 100,
      discountPercentage: 0.1,
      taxProfileId: taxIva15.id,
    },
    // Línea 2: 5 u de SKU02 @ C$ 150, sin descuento, sin impuesto
    // Neto = 750.00 | Costo hist. = 5 * 70 = 350.00 | Utilidad = 400.00
    {
      productId: prodNachos.id,
      quantity: 5,
      unitPrice: 150,
      taxProfileId: taxZero.id,
    },
    // Línea 3: 1 Servicio SRV01 @ C$ 400, sin descuento, sin impuesto
    // Neto = 400.00 | Costo hist. (referencia catálogo) = 120.00 | Utilidad = 280.00 (NO descuenta stock)
    {
      productId: prodEvento.id,
      quantity: 1,
      unitPrice: 400,
      taxProfileId: taxZero.id,
    },
  ],
});
recordedSales.push(saleFebContado);

assert.equal(saleFebContado.netSubtotal, 2050); // 900 + 750 + 400
assert.equal(saleFebContado.taxTotal, 135);
assert.equal(saleFebContado.grandTotal, 2185);
assert.equal(saleFebContado.costTotal, 1330);   // 860 + 350 + 120
assert.equal(saleFebContado.grossProfit, 720);  // 2050 - 1330
console.log(
  '  PASS [Pruebas #1, #3, #4, #5 y #20]: Venta de contado multi-línea con descuento, IVA 15% y Servicio calculada con precisión.'
);

// Verificar en la vista de REGISTRO DE VENTAS que 1 factura con 3 líneas cuenta como 3 líneas pero N.º DE VENTAS = 1 (vta_Primera)
const salesSheetAfterVta1 = salesService.getSalesRegisterSheetView(ownerCtx, recordedSales);
assert.equal(salesSheetAfterVta1.kpis.registeredLinesCount, 3);
assert.equal(salesSheetAfterVta1.kpis.uniqueSalesCount, 1);
assert.equal(salesSheetAfterVta1.kpis.netSalesTotal, 2050);
assert.equal(salesSheetAfterVta1.kpis.grandBilledTotal, 2185);
console.log('  PASS: Conteo vta_Primera verificado (3 líneas registradas => 1 sola transacción de venta, sin duplicar totales).');

// Prueba #17 y #18: Compra retroactiva en Febrero y Recálculo automático de Costo Promedio y Costos Históricos de Ventas
// En Febrero teníamos apertura de 48 u de SKU01 @ C$ 86.00 = C$ 4,128.00.
// Si registramos una compra retroactiva con fecha 2026-02-02 de 48 u @ C$ 110.00 = C$ 5,280.00:
// El nuevo CPP de Febrero pasa a ser: (4,128 + 5,280) / (48 + 48) = 9,408 / 96 = C$ 98.00!
// Y el costo histórico de la Línea 1 de VTA-0001 (10 u vendidas en Febrero) debe actualizarse automáticamente a 10 * 98 = C$ 980.00,
// además de propagar el nuevo saldo inicial a Marzo y recalcular el CPP de Marzo!
inventoryService.registerPurchaseWithCostingRecalculation(ownerCtx, {
  id: 'comp-feb-retro',
  purchaseNumber: 'COMP-0003',
  supplierId: supCerveceria.id,
  date: '2026-02-02',
  productId: prodTona.id,
  quantity: 48,
  unitCost: 110,
  taxProfileId: taxZero.id,
  paymentCondition: 'CASH',
  financialAccountId: accBanco.id,
});

const sku01AfterRetro = engine.getProductCostingSummary(ownerCtx, prodTona.id);
assert.equal(sku01AfterRetro.monthlyBreakdown[1]?.weightedAverageCost, 98); // Febrero CPP = 98.00
assert.equal(saleFebContado.lines[0]?.historicalUnitCost, 98);
assert.equal(saleFebContado.lines[0]?.costTotal, 980);
// En Marzo: Apertura = (96 - 10 vendidas en Feb) = 86 u @ 98 = 8,428.00 + Compra Marzo (50 u = 4,750.00)
// Nuevo CPP Marzo = (8,428 + 4,750) / (86 + 50) = 13,178 / 136 = 96.8970588235294
assert.ok(Math.abs((sku01AfterRetro.monthlyBreakdown[2]?.weightedAverageCost ?? 0) - 13178 / 136) < 1e-9);
console.log(
  '  PASS [Pruebas #17 y #18]: Compra retroactiva en Febrero recalcula CPP de Febrero (86 -> 98), actualiza costo histórico de venta en Febrero y arrastra nuevo saldo a Marzo.'
);

// Prueba #2 y #24: Venta a crédito y posterior Anulación compensatoria auditable
const saleCredito = engine.registerSale(ownerCtx, {
  id: 'vta-mar-cred',
  saleNumber: 'VTA-0002',
  customerId: cliHotel.id,
  date: '2026-03-15',
  paymentCondition: 'CREDIT',
  creditDays: 15,
  lines: [
    {
      productId: prodTona.id,
      quantity: 20,
      unitPrice: 120,
      taxProfileId: taxZero.id,
    },
  ],
});
recordedSales.push(saleCredito);

assert.equal(saleCredito.dueDate, '2026-03-30');
assert.equal(engine.getAccountsReceivableReport(ownerCtx).length, 1);

const stockBeforeVoid = engine.getProductCostingSummary(ownerCtx, prodTona.id).finalStock; // 136 - 20 = 116
assert.equal(stockBeforeVoid, 116);

// Anular VTA-0002 con motivo obligatorio
engine.voidSale(ownerCtx, saleCredito.id, 'Error en cantidad solicitada por Hotel Colonial');
const stockAfterVoid = engine.getProductCostingSummary(ownerCtx, prodTona.id).finalStock;
assert.equal(stockAfterVoid, 136); // Las 20 unidades regresaron al inventario
assert.equal(engine.getAccountsReceivableReport(ownerCtx).length, 0); // La CxC quedó anulada
console.log(
  '  PASS [Pruebas #2 y #24]: Venta a crédito genera CxC y su anulación compensatoria restaura el stock (116 -> 136) y cancela la CxC dejando rastro de auditoría.'
);

// Prueba de Cierre y Bloqueo de Período Contable de Inventario (Enero 2026)
inventoryService.closeValuationPeriod(ownerCtx, 2026, 1);
assert.throws(
  () =>
    inventoryService.registerPurchaseWithCostingRecalculation(ownerCtx, {
      id: 'comp-ene-blocked',
      purchaseNumber: 'COMP-BLK',
      supplierId: supCerveceria.id,
      date: '2026-01-25',
      productId: prodTona.id,
      quantity: 10,
      unitCost: 85,
      taxProfileId: taxZero.id,
      paymentCondition: 'CASH',
      financialAccountId: accCaja.id,
    }),
  /período contable de inventario 2026-01 está cerrado y bloqueado/,
  'Debe impedir compras o ajustes retroactivos en un mes cerrado'
);
console.log('  PASS: Bloqueo de período cerrado (2026-01) impide alteraciones retroactivas no autorizadas.');

// Verificar tabla de conciliación mensual de inventario (CÁLCULOS!D10:O15) y los 31 Controles de Conciliación
const invSheetView = inventoryService.getInventorySheetView(ownerCtx);
for (const mRow of invSheetView.monthlyValuationTable) {
  assert.equal(
    mRow.verificationDiff,
    0,
    `La verificación de inventario del mes ${mRow.month} (Inicial + Compras - CostoVentas + Ajustes - Final) debe ser 0.00`
  );
}

// Verificar primero que el Control #15 detecta cuando una cuenta financiera ("Banco principal") queda en saldo negativo
const reconBeforeBankFunding = engine.executeReconciliationCenter(ownerCtx);
const ctl15 = reconBeforeBankFunding.controls.find((c) => c.code === 15);
assert.equal(ctl15?.state, 'REVISAR', 'El Control #15 debe marcar REVISAR cuando una cuenta tiene saldo negativo');
console.log('  PASS [Control #15]: El Centro de Control detecta automáticamente saldo negativo en Banco principal.');

// Configurar el saldo inicial real de Banco principal (C$ 15,000.00) y volver a ejecutar los 31 Controles
accBanco.openingBalance = 15000;
const recon = engine.executeReconciliationCenter(ownerCtx);
assert.equal(recon.reviewCount, 0, 'Ningún control debe estar en estado REVISAR');
console.log(
  `  PASS: Conciliación global de inventario (12 meses con diferencia 0.00) y Centro de Control (${recon.okCount} OK, ${recon.reviewCount} REVISAR) verificados.`
);

console.log('\n======================================================================');
console.log('RESULTADO FINAL: TODAS LAS PRUEBAS DE LAS FASES 3 Y 4 PASARON AL 100%');
console.log('======================================================================');
