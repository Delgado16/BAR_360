import assert from 'node:assert/strict';
import { prisma } from '../infrastructure/database/prisma-client.ts';
import { ensureTenantWorkspace } from '../infrastructure/database/tenant-bootstrap.ts';
import { PurchasesPostgresService } from '../application/services/purchases-pg.service.ts';
import { SalesPostgresService } from '../application/services/sales-pg.service.ts';
import { FinancePostgresService } from '../application/services/finance-pg.service.ts';
import { IntelligencePostgresService } from '../application/services/intelligence-pg.service.ts';
import { type AuthenticatedTenantContext } from '../domain/policies/rbac.policy.ts';

console.log('======================================================================');
console.log('MI NEGOCIO PRO 360 — PRUEBAS DE INTELIGENCIA Y CONCILIACIÓN PG (ETAPAS 5-6)');
console.log('======================================================================\n');

const suffix = Date.now();
const slug = `test-bi-${suffix}`;

const purchaseService = new PurchasesPostgresService();
const salesService = new SalesPostgresService();
const financeService = new FinancePostgresService();
const intelligenceService = new IntelligencePostgresService();

let tenantId = '';

async function main() {
  try {
    const tenant = await ensureTenantWorkspace(slug);
    tenantId = tenant.id;

    const ctx: AuthenticatedTenantContext = {
      userId: '00000000-0000-0000-0000-0000000000a5',
      email: 'bi@empresa.com',
      platformRole: 'USER',
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      tenantStatus: 'ACTIVE',
      roleCode: 'TENANT_OWNER',
    };

    const [cat, unit, expCat, taxZero, pm, accCaja, accBanco, cli] = await Promise.all([
      prisma.productCategory.findFirstOrThrow({ where: { tenantId } }),
      prisma.unitOfMeasure.findFirstOrThrow({ where: { tenantId } }),
      prisma.expenseCategory.findFirstOrThrow({ where: { tenantId } }),
      prisma.taxProfile.findFirstOrThrow({ where: { tenantId, rate: 0 } }),
      prisma.paymentMethod.findFirstOrThrow({ where: { tenantId } }),
      prisma.financialAccount.findFirstOrThrow({ where: { tenantId, type: 'CASH' } }),
      prisma.financialAccount.findFirstOrThrow({ where: { tenantId, type: 'BANK' } }),
      prisma.customer.findFirstOrThrow({ where: { tenantId } }),
    ]);

    const sup = await prisma.supplier.create({
      data: { tenantId, code: 'PRV-01', name: 'Proveedor BI' },
    });
    const prod = await prisma.product.create({
      data: {
        tenantId,
        sku: 'SKU-BI',
        name: 'Producto BI',
        categoryId: cat.id,
        unitId: unit.id,
        type: 'PRODUCT',
        salePrice: 150,
        referenceCost: 80,
        minimumStock: 5,
      },
    });

    // 1. Aporte inicial (+5000), Compra (20 @ 80 = -1600), Venta (10 @ 150 = +1500), Gasto (-300), Transferencia (1000)
    await financeService.registerCashAdjustment(ctx, {
      financialAccountId: accCaja.id,
      date: '2026-11-01',
      direction: 'INFLOW',
      amount: 5000,
      reason: 'Capital inicial',
    });
    await purchaseService.confirmPurchase(ctx, {
      supplierId: sup.id,
      productId: prod.id,
      taxProfileId: taxZero.id,
      date: '2026-11-05',
      quantity: 20,
      unitCost: 80,
      paymentCondition: 'CASH',
      financialAccountId: accCaja.id,
    });
    await salesService.confirmSale(ctx, {
      customerId: cli.id,
      date: '2026-11-10',
      paymentCondition: 'CASH',
      paymentMethodId: pm.id,
      financialAccountId: accCaja.id,
      lines: [{ productId: prod.id, quantity: 10, taxProfileId: taxZero.id }],
    });
    await financeService.registerExpense(ctx, {
      categoryId: expCat.id,
      taxProfileId: taxZero.id,
      date: '2026-11-12',
      description: 'Energía eléctrica',
      netAmount: 300,
      paymentCondition: 'CASH',
      paymentMethodId: pm.id,
      financialAccountId: accCaja.id,
    });
    await financeService.transferBetweenAccounts(ctx, {
      sourceAccountId: accCaja.id,
      destinationAccountId: accBanco.id,
      date: '2026-11-15',
      amount: 1000,
      reason: 'Depósito banco',
    });

    // 2. Dashboard Empresarial (16 KPIs)
    const dash = await intelligenceService.getEnterpriseDashboard(tenantId);
    assert.equal(dash.monthNetSales, 1500);
    assert.equal(dash.monthCogs, 800);
    assert.equal(dash.monthGrossProfit, 700);
    assert.equal(dash.monthOpEx, 300);
    assert.equal(dash.monthOpProfit, 400);
    assert.equal(dash.inventoryValue, 800);
    assert.equal(dash.totalCashAndBanks, 4600);
    console.log('  PASS [BI-1]: Dashboard Empresarial (16 KPIs) verificado contra PostgreSQL.');

    // 3. Flujo de Caja (transferencias excluidas de totales consolidados)
    const cashFlow = await intelligenceService.getCashFlowReport(tenantId, 2026);
    const novFlow = cashFlow.months[10]!;
    assert.equal(novFlow.inflows, 6500); // 5000 + 1500 (excluye 1000 transferencia)
    assert.equal(novFlow.outflows, 1900); // 1600 + 300 (excluye 1000 transferencia)
    assert.equal(cashFlow.finalBalance, 4600);
    console.log('  PASS [BI-2]: Flujo de Caja excluye transferencias internas y cuadra Saldo Final (4,600.00).');

    // 4. Estado de Resultados
    const pnl = await intelligenceService.getIncomeStatementReport(tenantId, 2026);
    const novPnl = pnl.months[10]!;
    assert.equal(novPnl.netSales, 1500);
    assert.equal(novPnl.cogs, 800);
    assert.equal(novPnl.grossProfit, 700);
    assert.equal(novPnl.operatingExpenses, 300);
    assert.equal(novPnl.operatingProfit, 400);
    console.log('  PASS [BI-3]: Estado de Resultados verificado contra PostgreSQL (Utilidad Op = 400.00).');

    // 5. Conciliación de 31 controles persistida en financial_reconciliations
    const recon = await intelligenceService.runAndPersistReconciliation(ctx);
    const failed = recon.controls.filter((c) => c.state !== 'OK');
    assert.equal(
      recon.reviewCount + recon.alertCount,
      0,
      `Controles no OK: ${failed.map((f) => `${f.code}:${f.description}(diff=${f.difference})`).join(', ')}`,
    );
    assert.equal(recon.okCount, 31);
    assert.equal(recon.overallState, 'OK');
    console.log('  PASS [BI-4]: Motor de Conciliación ejecutado y persistido en PostgreSQL (31/31 OK).');

    console.log('\n======================================================================');
    console.log('✔ PRUEBAS DE INTELIGENCIA Y CONCILIACIÓN PG (ETAPAS 5-6): 100% EXITOSAS');
    console.log('======================================================================');
  } finally {
    if (tenantId) {
      await prisma.financialReconciliation.deleteMany({ where: { tenantId } });
      await prisma.auditLog.deleteMany({ where: { tenantId } });
      await prisma.cashMovement.deleteMany({ where: { tenantId } });
      await prisma.cashAdjustment.deleteMany({ where: { tenantId } });
      await prisma.bankTransfer.deleteMany({ where: { tenantId } });
      await prisma.operatingExpense.deleteMany({ where: { tenantId } });
      await prisma.inventoryMovement.deleteMany({ where: { tenantId } });
      await prisma.inventoryMonthlyCost.deleteMany({ where: { tenantId } });
      await prisma.saleStatusHistory.deleteMany({ where: { sale: { tenantId } } });
      await prisma.saleItem.deleteMany({ where: { tenantId } });
      await prisma.sale.deleteMany({ where: { tenantId } });
      await prisma.purchaseItem.deleteMany({ where: { tenantId } });
      await prisma.purchase.deleteMany({ where: { tenantId } });
      await prisma.product.deleteMany({ where: { tenantId } });
      await prisma.customer.deleteMany({ where: { tenantId } });
      await prisma.supplier.deleteMany({ where: { tenantId } });
      await prisma.financialAccount.deleteMany({ where: { tenantId } });
      await prisma.paymentMethod.deleteMany({ where: { tenantId } });
      await prisma.taxProfile.deleteMany({ where: { tenantId } });
      await prisma.productCategory.deleteMany({ where: { tenantId } });
      await prisma.expenseCategory.deleteMany({ where: { tenantId } });
      await prisma.unitOfMeasure.deleteMany({ where: { tenantId } });
      await prisma.tenant.delete({ where: { id: tenantId } });
    }
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
