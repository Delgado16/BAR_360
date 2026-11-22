import assert from 'node:assert/strict';
import { type AuthenticatedTenantContext } from '../domain/policies/rbac.policy.ts';
import { EnterpriseSaaSEngine, type OperatingExpenseEntity } from '../domain/services/enterprise-saas.service.ts';
import { CatalogsAndConfigService } from '../domain/services/catalogs-config.service.ts';
import { FinanceAndTreasuryService } from '../domain/services/finance-treasury.service.ts';

console.log('======================================================================');
console.log('MI NEGOCIO PRO 360 — EJECUCIÓN DE PRUEBAS AUTOMATIZADAS (FASE 5)');
console.log('======================================================================\n');

const engine = new EnterpriseSaaSEngine();
const catalogService = new CatalogsAndConfigService(engine);
const financeService = new FinanceAndTreasuryService(engine);

const ownerCtx: AuthenticatedTenantContext = {
  userId: 'user-owner-f5',
  email: 'finanzas@fronterasbar.com',
  platformRole: 'USER',
  tenantId: 'tenant-f5-fronteras',
  tenantSlug: 'fronteras-bar',
  tenantStatus: 'ACTIVE',
  roleCode: 'TENANT_OWNER',
};

// 1. Configuración base ("Fronteras Bar", fecha de corte 2026-11-02)
const seeded = catalogService.seedDefaultConfigurationForTenant(ownerCtx, {
  tradeName: 'Fronteras Bar',
  currencyCode: 'NIO',
  operatingYear: 2026,
  analysisMonth: 11,
});

const settings = engine.getTenantSettings(ownerCtx, ownerCtx.tenantId);
settings.cutoffDate = '2026-11-02';

const taxZero = seeded.taxProfiles[0]!;
const taxIva15 = engine.createTaxProfile(ownerCtx, { id: 'tax-iva15', name: 'IVA 15%', rate: 0.15 });
const accCaja = seeded.financialAccounts[0]!;  // Caja general
const accBanco = seeded.financialAccounts[1]!; // Banco principal
accCaja.openingBalance = 5000;
accBanco.openingBalance = 20000;

const pmEfectivo = seeded.paymentMethods[0]!;
const pmTransf = seeded.paymentMethods[1]!;
const catAlquiler = seeded.expenseCategories.find((c) => c.name === 'Alquiler')!;
const catElectricidad = seeded.expenseCategories.find((c) => c.name === 'Electricidad')!;
const catBebidas = seeded.productCategories.find((c) => c.name === 'Bebidas')!;

const supCerveceria = engine.createSupplier(ownerCtx, {
  id: 'sup-1',
  code: 'PRV01',
  name: 'Distribuidora Central',
});
const cliHotel = engine.createCustomer(ownerCtx, {
  id: 'cli-1',
  code: 'CLI01',
  name: 'Hotel Colonial',
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
  minimumStock: 10,
  openingStockQuantity: 200,
  openingUnitCost: 80,
});

// --------------------------------------------------------------------------
// Prueba #8 y #9: Gasto de contado y Gasto a crédito (impuesto recuperable)
// --------------------------------------------------------------------------
const expensesList: OperatingExpenseEntity[] = [];

// Gasto de contado (Alquiler C$ 4,000 + IVA 15% = C$ 4,600 pagado desde Banco)
// Con tratamiento RECOVERABLE, gas_Resultados = 4,000.00
const gasContado = financeService.registerExpense(ownerCtx, {
  id: 'gas-1',
  expenseNumber: 'GAS-0001',
  date: '2026-10-05',
  categoryId: catAlquiler.id,
  description: 'Alquiler local Octubre',
  netAmount: 4000,
  taxProfileId: taxIva15.id,
  paymentCondition: 'CASH',
  paymentMethodId: pmTransf.id,
  financialAccountId: accBanco.id,
});
expensesList.push(gasContado);
assert.equal(gasContado.taxAmount, 600);
assert.equal(gasContado.totalAmount, 4600);
assert.equal(gasContado.incomeStatementAmount, 4000);
console.log('  PASS [Prueba #8]: Gasto de contado con IVA 15% recuperable (Total=4,600, Resultados=4,000).');

// Gasto a crédito (Electricidad C$ 1,200 sin impuesto, vence 2026-10-25 -> VENCIDO respecto a corte 2026-11-02)
const gasCredito = financeService.registerExpense(ownerCtx, {
  id: 'gas-2',
  expenseNumber: 'GAS-0002',
  date: '2026-10-10',
  categoryId: catElectricidad.id,
  description: 'Factura energía eléctrica',
  netAmount: 1200,
  taxProfileId: taxZero.id,
  paymentCondition: 'CREDIT',
  dueDate: '2026-10-25',
});
expensesList.push(gasCredito);
assert.equal(gasCredito.totalAmount, 1200);
console.log('  PASS [Prueba #9]: Gasto a crédito registrado y reflejado en Cuentas por Pagar.');

// --------------------------------------------------------------------------
// Prueba #10, #11 y #21: Ventas a crédito, Antigüedad en tramos, Cobro Parcial y Cobro Total
// --------------------------------------------------------------------------
// Venta 1: 2026-07-01, vence 2026-07-31 (94 días de atraso al 2026-11-02 -> Más de 90 días, VENCIDO)
const vtaVencida90 = engine.registerSale(ownerCtx, {
  id: 'vta-1',
  saleNumber: 'VTA-0001',
  customerId: cliHotel.id,
  date: '2026-07-01',
  paymentCondition: 'CREDIT',
  creditDays: 30, // Vence 2026-07-31
  lines: [{ productId: prodTona.id, quantity: 10, unitPrice: 100, taxProfileId: taxZero.id }],
});

// Venta 2: 2026-10-08, vence 2026-11-07 (5 días para vencer desde 2026-11-02 -> Estado "Por vencer", Al corriente)
const vtaPorVencer = engine.registerSale(ownerCtx, {
  id: 'vta-2',
  saleNumber: 'VTA-0002',
  customerId: cliHotel.id,
  date: '2026-10-08',
  paymentCondition: 'CREDIT',
  creditDays: 30, // Vence 2026-11-07
  lines: [{ productId: prodTona.id, quantity: 5, unitPrice: 100, taxProfileId: taxZero.id }],
});

// Venta 3: 2026-11-01, vence 2026-12-01 (Al corriente, Pendiente)
const vtaCorriente = engine.registerSale(ownerCtx, {
  id: 'vta-3',
  saleNumber: 'VTA-0003',
  customerId: cliHotel.id,
  date: '2026-11-01',
  paymentCondition: 'CREDIT',
  creditDays: 30,
  lines: [{ productId: prodTona.id, quantity: 8, unitPrice: 100, taxProfileId: taxZero.id }],
});

const cxcInitial = financeService.getReceivablesSheetView(ownerCtx);
assert.equal(cxcInitial.kpis.totalReceivable, 2300); // 1000 + 500 + 800
assert.equal(cxcInitial.kpis.overdueTotal, 1000);
const row1 = cxcInitial.rows.find((r) => r.saleId === vtaVencida90.id)!;
const row2 = cxcInitial.rows.find((r) => r.saleId === vtaPorVencer.id)!;
const row3 = cxcInitial.rows.find((r) => r.saleId === vtaCorriente.id)!;
assert.equal(row1.status, 'OVERDUE');
assert.equal(row1.agingBucket, 'DAYS_OVER_90');
assert.equal(row1.daysOverdue, 94);
assert.equal(row2.status, 'DUE_SOON'); // Por vencer (<= 7 días)
assert.equal(row3.status, 'PENDING');
console.log('  PASS [Prueba #21]: Cuentas vencidas, "Por vencer" (<=7 días) y antigüedad (94 días -> Más de 90 días) verificadas.');

// Prueba #10: Cobro parcial sobre VTA-0003 (C$ 300 de C$ 800)
financeService.registerCollection(ownerCtx, {
  id: 'cob-1',
  collectionNumber: 'COB-0001',
  date: '2026-11-02',
  saleId: vtaCorriente.id,
  amount: 300,
  paymentMethodId: pmEfectivo.id,
  financialAccountId: accCaja.id,
  idempotencyKey: 'idem-cob-1',
});
const cxcAfterPartial = financeService.getReceivablesSheetView(ownerCtx);
const row3AfterPartial = cxcAfterPartial.rows.find((r) => r.saleId === vtaCorriente.id)!;
assert.equal(row3AfterPartial.paidAmount, 300);
assert.equal(row3AfterPartial.balanceAmount, 500);
assert.equal(row3AfterPartial.status, 'PARTIAL');
console.log('  PASS [Prueba #10]: Cobro parcial de CxC (300 de 800) actualiza saldo a 500 y estado a Parcial.');

// Prueba #11 y #28: Cobro total restante (C$ 500) + bloqueo de sobrecobro y doble envío por idempotencia
financeService.registerCollection(ownerCtx, {
  id: 'cob-2',
  collectionNumber: 'COB-0002',
  date: '2026-11-02',
  saleId: vtaCorriente.id,
  amount: 500,
  paymentMethodId: pmEfectivo.id,
  financialAccountId: accCaja.id,
  idempotencyKey: 'idem-cob-2',
});
const cxcAfterTotal = financeService.getReceivablesSheetView(ownerCtx);
const row3Settled = cxcAfterTotal.rows.find((r) => r.saleId === vtaCorriente.id)!;
assert.equal(row3Settled.balanceAmount, 0);
assert.equal(row3Settled.status, 'SETTLED');

// Bloqueo de sobrecobro
assert.throws(
  () =>
    financeService.registerCollection(ownerCtx, {
      id: 'cob-over',
      collectionNumber: 'COB-OVER',
      date: '2026-11-02',
      saleId: vtaCorriente.id,
      amount: 10,
      paymentMethodId: pmEfectivo.id,
      financialAccountId: accCaja.id,
    }),
  /Excede el saldo pendiente de la venta/
);

// Bloqueo de fecha anterior a la venta
assert.throws(
  () =>
    financeService.registerCollection(ownerCtx, {
      id: 'cob-early',
      collectionNumber: 'COB-EARLY',
      date: '2026-06-15',
      saleId: vtaVencida90.id,
      amount: 100,
      paymentMethodId: pmEfectivo.id,
      financialAccountId: accCaja.id,
    }),
  /Fecha de cobro anterior a la fecha de la venta/
);

// Prueba #28: Doble envío simultáneo con misma idempotencyKey
assert.throws(
  () =>
    financeService.registerCollection(ownerCtx, {
      id: 'cob-2-dup',
      collectionNumber: 'COB-0003',
      date: '2026-11-02',
      saleId: vtaVencida90.id,
      amount: 100,
      paymentMethodId: pmEfectivo.id,
      financialAccountId: accCaja.id,
      idempotencyKey: 'idem-cob-2',
    }),
  /Operación duplicada bloqueada por clave de idempotencia/
);
console.log('  PASS [Pruebas #11 y #28]: Cobro total liquida factura, bloquea sobrecobro, bloquea fecha anterior e impide doble envío.');

// --------------------------------------------------------------------------
// Prueba #12 y #13: Compra a crédito + Pago parcial + Pago total (Compra y Gasto)
// --------------------------------------------------------------------------
const compCredito = engine.registerPurchase(ownerCtx, {
  id: 'comp-cred-1',
  purchaseNumber: 'COMP-0001',
  supplierId: supCerveceria.id,
  date: '2026-10-15',
  productId: prodTona.id,
  quantity: 20,
  unitCost: 85,
  taxProfileId: taxZero.id,
  paymentCondition: 'CREDIT',
}); // Total C$ 1,700.00

// Pago parcial a compra a crédito (C$ 700 de C$ 1,700)
financeService.registerPayment(ownerCtx, {
  id: 'pag-1',
  paymentNumber: 'PAG-0001',
  date: '2026-10-20',
  obligationId: compCredito.id,
  amount: 700,
  paymentMethodId: pmTransf.id,
  financialAccountId: accBanco.id,
});

// Pago total al gasto a crédito GAS-0002 (C$ 1,200)
financeService.registerPayment(ownerCtx, {
  id: 'pag-2',
  paymentNumber: 'PAG-0002',
  date: '2026-10-24',
  obligationId: gasCredito.id,
  amount: 1200,
  paymentMethodId: pmTransf.id,
  financialAccountId: accBanco.id,
});

const cxpView = financeService.getPayablesSheetView(ownerCtx);
assert.equal(cxpView.kpis.totalPayable, 1000); // 1,700 - 700 = 1,000; GAS-0002 = 0
const cxpComp = cxpView.rows.find((r) => r.obligationId === compCredito.id)!;
const cxpGas = cxpView.rows.find((r) => r.obligationId === gasCredito.id)!;
assert.equal(cxpComp.status, 'PARTIAL');
assert.equal(cxpComp.balanceAmount, 1000);
assert.equal(cxpGas.status, 'SETTLED');

// Bloquear sobrepago en obligación ya saldada
assert.throws(
  () =>
    financeService.registerPayment(ownerCtx, {
      id: 'pag-over',
      paymentNumber: 'PAG-OVER',
      date: '2026-10-26',
      obligationId: gasCredito.id,
      amount: 1,
      paymentMethodId: pmTransf.id,
      financialAccountId: accBanco.id,
    }),
  /Excede el saldo de la obligación/
);
console.log('  PASS [Pruebas #12 y #13]: Pago parcial (Compra) y Pago total (Gasto) en CxP verificados, bloqueando sobrepagos.');

// --------------------------------------------------------------------------
// Prueba #14 y #22: Transferencia entre cuentas y Conciliación de Caja y Bancos
// --------------------------------------------------------------------------
// Transferir C$ 2,000 de Caja general hacia Banco principal
financeService.registerTransfer(ownerCtx, {
  id: 'trf-1',
  transferNumber: 'TRF-0001',
  date: '2026-11-02',
  sourceAccountId: accCaja.id,
  destinationAccountId: accBanco.id,
  amount: 2000,
  reason: 'Depósito de efectivo en banco',
});

// Bloquear transferencia con origen == destino
assert.throws(
  () =>
    financeService.registerTransfer(ownerCtx, {
      id: 'trf-bad',
      transferNumber: 'TRF-BAD',
      date: '2026-11-02',
      sourceAccountId: accCaja.id,
      destinationAccountId: accCaja.id,
      amount: 100,
    }),
  /Origen y destino iguales/
);

// Ajuste justificado de caja (sobrante de arqueo +50 en Caja general)
financeService.registerCashAdjustment(ownerCtx, {
  id: 'cor-1',
  adjustmentNumber: 'COR-0001',
  date: '2026-11-02',
  financialAccountId: accCaja.id,
  direction: 'INFLOW',
  amount: 50,
  reason: 'Sobrante en arqueo de cierre',
});

const cashView = financeService.getCashAndBanksSheetView(ownerCtx);
// Caja general: 5,000 (ini) + 800 (cobros 300+500) - 2,000 (transf salida) + 50 (ajuste) = C$ 3,850.00
// Banco principal: 20,000 (ini) - 4,600 (gasto contado) - 1,900 (pagos 700+1200) + 2,000 (transf entrada) = C$ 15,500.00
const cajaRow = cashView.accounts.find((a) => a.accountId === accCaja.id)!;
const bancoRow = cashView.accounts.find((a) => a.accountId === accBanco.id)!;
assert.equal(cajaRow.currentBalance, 3850);
assert.equal(bancoRow.currentBalance, 15500);
assert.equal(cashView.kpis.totalBalance, 19350);
assert.equal(cashView.transfersNetDiff, 0);
console.log(
  '  PASS [Pruebas #14 y #22]: Transferencia entre cuentas (efecto neto 0.00), ajuste de caja (+50) y saldos de Caja (3,850) y Banco (15,500) conciliados.'
);

// Verificar Puente Utilidad -> Flujo de Caja y 31 Controles de Conciliación
const isBridge = engine.getAnnualIncomeStatementAndBridge(ownerCtx);
assert.equal(isBridge.maxAbsBridgeDiff, 0, 'El puente Utilidad -> Efectivo debe cuadrar con diferencia 0.00');

const recon = engine.executeReconciliationCenter(ownerCtx);
assert.equal(recon.reviewCount, 0);
assert.equal(recon.okCount, 31);
console.log(
  `  PASS: Puente Utilidad -> Efectivo (diff max = ${isBridge.maxAbsBridgeDiff.toFixed(2)}) y 31/31 Controles en estado OK.`
);

console.log('\n======================================================================');
console.log('RESULTADO FINAL: TODAS LAS PRUEBAS DE LA FASE 5 PASARON AL 100%');
console.log('======================================================================');
