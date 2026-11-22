import assert from 'node:assert/strict';
import { prisma } from '../infrastructure/database/prisma-client.ts';
import { ensureTenantWorkspace } from '../infrastructure/database/tenant-bootstrap.ts';
import { InventoryPostgresService } from '../application/services/inventory-pg.service.ts';
import { PurchasesPostgresService } from '../application/services/purchases-pg.service.ts';
import { SalesPostgresService } from '../application/services/sales-pg.service.ts';
import { FinancePostgresService } from '../application/services/finance-pg.service.ts';
import { type AuthenticatedTenantContext } from '../domain/policies/rbac.policy.ts';

console.log('======================================================================');
console.log('MI NEGOCIO PRO 360 — PRUEBAS FINANCIERAS REALES CONTRA POSTGRESQL (ETAPA 4)');
console.log('======================================================================\n');

const suffix = Date.now();
const slugA = `test-fin-a-${suffix}`;
const slugB = `test-fin-b-${suffix}`;

const inventoryService = new InventoryPostgresService();
const purchaseService = new PurchasesPostgresService();
const salesService = new SalesPostgresService();
const financeService = new FinancePostgresService();

let tenantAId = '';
let tenantBId = '';

async function main() {
  try {
    const [tenantA, tenantB] = await Promise.all([
      ensureTenantWorkspace(slugA),
      ensureTenantWorkspace(slugB),
    ]);
    tenantAId = tenantA.id;
    tenantBId = tenantB.id;

    const ctxA: AuthenticatedTenantContext = {
      userId: '00000000-0000-0000-0000-0000000000a2',
      email: 'finanzas@empresa-a.com',
      platformRole: 'USER',
      tenantId: tenantA.id,
      tenantSlug: tenantA.slug,
      tenantStatus: 'ACTIVE',
      roleCode: 'TENANT_OWNER',
    };

    const ctxB: AuthenticatedTenantContext = {
      userId: '00000000-0000-0000-0000-0000000000b2',
      email: 'finanzas@empresa-b.com',
      platformRole: 'USER',
      tenantId: tenantB.id,
      tenantSlug: tenantB.slug,
      tenantStatus: 'ACTIVE',
      roleCode: 'TENANT_OWNER',
    };

    const [expCatA, taxIvaA, taxZeroA, pmA, accCajaA, accBancoA, cliA, catA, unitA] =
      await Promise.all([
        prisma.expenseCategory.findFirstOrThrow({ where: { tenantId: tenantA.id } }),
        prisma.taxProfile.findFirstOrThrow({ where: { tenantId: tenantA.id, rate: 0.15 } }),
        prisma.taxProfile.findFirstOrThrow({ where: { tenantId: tenantA.id, rate: 0 } }),
        prisma.paymentMethod.findFirstOrThrow({ where: { tenantId: tenantA.id } }),
        prisma.financialAccount.findFirstOrThrow({ where: { tenantId: tenantA.id, type: 'CASH' } }),
        prisma.financialAccount.findFirstOrThrow({ where: { tenantId: tenantA.id, type: 'BANK' } }),
        prisma.customer.findFirstOrThrow({ where: { tenantId: tenantA.id } }),
        prisma.productCategory.findFirstOrThrow({ where: { tenantId: tenantA.id } }),
        prisma.unitOfMeasure.findFirstOrThrow({ where: { tenantId: tenantA.id } }),
      ]);

    const [pmB, accCajaB] = await Promise.all([
      prisma.paymentMethod.findFirstOrThrow({ where: { tenantId: tenantB.id } }),
      prisma.financialAccount.findFirstOrThrow({ where: { tenantId: tenantB.id, type: 'CASH' } }),
    ]);

    // 1. Ajuste inicial de caja: +5,000.00 en Caja general
    await financeService.registerCashAdjustment(ctxA, {
      financialAccountId: accCajaA.id,
      date: '2026-11-01',
      direction: 'INFLOW',
      amount: 5000,
      reason: 'Aporte inicial de capital',
    });

    // 2. Gasto operativo a crédito: 1,000 + IVA 15% = 1,150 -> genera CxP
    const expense = await financeService.registerExpense(ctxA, {
      categoryId: expCatA.id,
      taxProfileId: taxIvaA.id,
      date: '2026-11-05',
      description: 'Alquiler de local',
      netAmount: 1000,
      paymentCondition: 'CREDIT',
      idempotencyKey: `exp-${suffix}`,
    });
    assert.equal(Number(expense.totalAmount), 1150);
    assert.equal(Number(expense.incomeStatementAmount), 1000); // Impuesto recuperable

    const payable = await prisma.accountPayable.findFirstOrThrow({
      where: { tenantId: tenantA.id, expenseId: expense.id },
    });
    assert.equal(Number(payable.balanceAmount), 1150);

    // Pago parcial a CxP: 500 -> saldo 650, PARTIAL
    await financeService.registerSupplierPayment(ctxA, {
      accountPayableId: payable.id,
      date: '2026-11-06',
      amount: 500,
      paymentMethodId: pmA.id,
      financialAccountId: accCajaA.id,
      idempotencyKey: `pag-${suffix}`,
    });
    const payableAfter = await prisma.accountPayable.findUniqueOrThrow({ where: { id: payable.id } });
    assert.equal(Number(payableAfter.balanceAmount), 650);
    assert.equal(payableAfter.status, 'PARTIAL');

    // Bloqueo de sobrepago
    await assert.rejects(
      () =>
        financeService.registerSupplierPayment(ctxA, {
          accountPayableId: payable.id,
          date: '2026-11-06',
          amount: 700,
          paymentMethodId: pmA.id,
          financialAccountId: accCajaA.id,
        }),
      /supera el saldo pendiente/i,
    );
    console.log('  PASS [FIN-1]: Gasto a crédito, CxP, pago parcial (saldo 650) y bloqueo de sobrepago en PostgreSQL.');

    // 3. Venta a crédito y cobro parcial (CxC)
    const supA = await prisma.supplier.create({
      data: { tenantId: tenantA.id, code: 'PRV-01', name: 'Proveedor Fin' },
    });
    const prodA = await prisma.product.create({
      data: {
        tenantId: tenantA.id,
        sku: 'SKU-FIN',
        name: 'Producto Fin',
        categoryId: catA.id,
        unitId: unitA.id,
        type: 'PRODUCT',
        salePrice: 100,
        referenceCost: 60,
      },
    });
    await purchaseService.confirmPurchase(ctxA, {
      supplierId: supA.id,
      productId: prodA.id,
      taxProfileId: taxZeroA.id,
      date: '2026-11-02',
      quantity: 20,
      unitCost: 60,
      paymentCondition: 'CASH',
      financialAccountId: accCajaA.id,
    });
    const saleCred = await salesService.confirmSale(ctxA, {
      customerId: cliA.id,
      date: '2026-11-07',
      paymentCondition: 'CREDIT',
      lines: [{ productId: prodA.id, quantity: 10, taxProfileId: taxZeroA.id }],
    });
    const receivable = await prisma.accountReceivable.findFirstOrThrow({
      where: { tenantId: tenantA.id, saleId: saleCred.id },
    });
    assert.equal(Number(receivable.balanceAmount), 1000);

    await financeService.registerCustomerPayment(ctxA, {
      accountReceivableId: receivable.id,
      date: '2026-11-08',
      amount: 400,
      paymentMethodId: pmA.id,
      financialAccountId: accCajaA.id,
      idempotencyKey: `cob-${suffix}`,
    });
    const receivableAfter = await prisma.accountReceivable.findUniqueOrThrow({
      where: { id: receivable.id },
    });
    assert.equal(Number(receivableAfter.balanceAmount), 600);
    assert.equal(receivableAfter.status, 'PARTIAL');
    console.log('  PASS [FIN-2]: Venta a crédito -> CxC -> cobro parcial (saldo 600) persistido en PostgreSQL.');

    // 4. Transferencia entre cuentas: 1,500 de Caja a Banco -> saldo consolidado invariable
    const balancesBefore = await financeService.listAccountBalances(tenantA.id);
    const totalBefore = balancesBefore.reduce((s, b) => s + b.currentBalance, 0);

    await financeService.transferBetweenAccounts(ctxA, {
      sourceAccountId: accCajaA.id,
      destinationAccountId: accBancoA.id,
      date: '2026-11-09',
      amount: 1500,
      reason: 'Depósito bancario',
    });

    const balancesAfter = await financeService.listAccountBalances(tenantA.id);
    const totalAfter = balancesAfter.reduce((s, b) => s + b.currentBalance, 0);
    assert.equal(totalAfter, totalBefore);
    const bancoBalance = balancesAfter.find((b) => b.id === accBancoA.id)!.currentBalance;
    assert.equal(bancoBalance, 1500);
    console.log('  PASS [FIN-3]: Transferencia Caja -> Banco (1,500) mantiene saldo consolidado intacto.');

    // 5. Seguridad multi-tenant: EMPRESA_B no puede cobrar CxC ni pagar CxP ni transferir desde cuentas de EMPRESA_A
    await assert.rejects(
      () =>
        financeService.registerCustomerPayment(ctxB, {
          accountReceivableId: receivable.id,
          date: '2026-11-10',
          amount: 100,
          paymentMethodId: pmB.id,
          financialAccountId: accCajaB.id,
        }),
      /otra empresa|no encontrada/i,
    );
    await assert.rejects(
      () =>
        financeService.registerSupplierPayment(ctxB, {
          accountPayableId: payable.id,
          date: '2026-11-10',
          amount: 100,
          paymentMethodId: pmB.id,
          financialAccountId: accCajaB.id,
        }),
      /otra empresa|no encontrada/i,
    );
    await assert.rejects(
      () =>
        financeService.transferBetweenAccounts(ctxB, {
          sourceAccountId: accCajaB.id,
          destinationAccountId: accCajaA.id,
          date: '2026-11-10',
          amount: 100,
        }),
      /otra empresa|no encontrada/i,
    );
    console.log('  PASS [FIN-4]: Aislamiento multi-tenant verificado en CxC, CxP y Transferencias.');

    console.log('\n======================================================================');
    console.log('✔ PRUEBAS FINANCIERAS REALES CONTRA POSTGRESQL (ETAPA 4): 100% EXITOSAS');
    console.log('======================================================================');
  } finally {
    for (const tid of [tenantAId, tenantBId].filter(Boolean)) {
      await prisma.auditLog.deleteMany({ where: { tenantId: tid } });
      await prisma.cashMovement.deleteMany({ where: { tenantId: tid } });
      await prisma.cashAdjustment.deleteMany({ where: { tenantId: tid } });
      await prisma.bankTransfer.deleteMany({ where: { tenantId: tid } });
      await prisma.receivableAllocation.deleteMany({ where: { tenantId: tid } });
      await prisma.salePayment.deleteMany({ where: { tenantId: tid } });
      await prisma.accountReceivable.deleteMany({ where: { tenantId: tid } });
      await prisma.payableAllocation.deleteMany({ where: { tenantId: tid } });
      await prisma.purchasePayment.deleteMany({ where: { tenantId: tid } });
      await prisma.accountPayable.deleteMany({ where: { tenantId: tid } });
      await prisma.operatingExpense.deleteMany({ where: { tenantId: tid } });
      await prisma.inventoryMovement.deleteMany({ where: { tenantId: tid } });
      await prisma.inventoryMonthlyCost.deleteMany({ where: { tenantId: tid } });
      await prisma.saleStatusHistory.deleteMany({ where: { sale: { tenantId: tid } } });
      await prisma.saleItem.deleteMany({ where: { tenantId: tid } });
      await prisma.sale.deleteMany({ where: { tenantId: tid } });
      await prisma.purchaseItem.deleteMany({ where: { tenantId: tid } });
      await prisma.purchase.deleteMany({ where: { tenantId: tid } });
      await prisma.product.deleteMany({ where: { tenantId: tid } });
      await prisma.customer.deleteMany({ where: { tenantId: tid } });
      await prisma.supplier.deleteMany({ where: { tenantId: tid } });
      await prisma.financialAccount.deleteMany({ where: { tenantId: tid } });
      await prisma.paymentMethod.deleteMany({ where: { tenantId: tid } });
      await prisma.taxProfile.deleteMany({ where: { tenantId: tid } });
      await prisma.productCategory.deleteMany({ where: { tenantId: tid } });
      await prisma.expenseCategory.deleteMany({ where: { tenantId: tid } });
      await prisma.unitOfMeasure.deleteMany({ where: { tenantId: tid } });
      await prisma.tenant.delete({ where: { id: tid } });
    }
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
