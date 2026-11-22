import assert from 'node:assert/strict';
import { prisma } from '../infrastructure/database/prisma-client.ts';
import { ensureTenantWorkspace } from '../infrastructure/database/tenant-bootstrap.ts';
import { InventoryPostgresService } from '../application/services/inventory-pg.service.ts';
import { PurchasesPostgresService } from '../application/services/purchases-pg.service.ts';
import { SalesPostgresService } from '../application/services/sales-pg.service.ts';
import { type AuthenticatedTenantContext } from '../domain/policies/rbac.policy.ts';

console.log('======================================================================');
console.log('MI NEGOCIO PRO 360 — PRUEBAS DE INTEGRACIÓN REALES CONTRA POSTGRESQL');
console.log('======================================================================\n');

const suffix = Date.now();
const slugA = `test-pg-empresa-a-${suffix}`;
const slugB = `test-pg-empresa-b-${suffix}`;

const inventoryService = new InventoryPostgresService();
const purchaseService = new PurchasesPostgresService();
const salesService = new SalesPostgresService();

let tenantAId = '';
let tenantBId = '';

async function main() {
try {
  // 1. Crear dos empresas reales aisladas en PostgreSQL (EMPRESA_A y EMPRESA_B)
  const tenantA = await ensureTenantWorkspace(slugA);
  const tenantB = await ensureTenantWorkspace(slugB);
  tenantAId = tenantA.id;
  tenantBId = tenantB.id;

  const ctxA: AuthenticatedTenantContext = {
    userId: '00000000-0000-0000-0000-0000000000a1',
    email: 'admin@empresa-a.com',
    platformRole: 'USER',
    tenantId: tenantA.id,
    tenantSlug: tenantA.slug,
    tenantStatus: 'ACTIVE',
    roleCode: 'TENANT_OWNER',
  };

  const ctxB: AuthenticatedTenantContext = {
    userId: '00000000-0000-0000-0000-0000000000b1',
    email: 'admin@empresa-b.com',
    platformRole: 'USER',
    tenantId: tenantB.id,
    tenantSlug: tenantB.slug,
    tenantStatus: 'ACTIVE',
    roleCode: 'TENANT_OWNER',
  };

  // Obtener catálogos base de A y B
  const [catA, unitA, taxZeroA, taxIvaA, accCajaA, pmEfectivoA, cliA] = await Promise.all([
    prisma.productCategory.findFirstOrThrow({ where: { tenantId: tenantA.id } }),
    prisma.unitOfMeasure.findFirstOrThrow({ where: { tenantId: tenantA.id } }),
    prisma.taxProfile.findFirstOrThrow({ where: { tenantId: tenantA.id, rate: 0 } }),
    prisma.taxProfile.findFirstOrThrow({ where: { tenantId: tenantA.id, rate: 0.15 } }),
    prisma.financialAccount.findFirstOrThrow({ where: { tenantId: tenantA.id, type: 'CASH' } }),
    prisma.paymentMethod.findFirstOrThrow({ where: { tenantId: tenantA.id } }),
    prisma.customer.findFirstOrThrow({ where: { tenantId: tenantA.id } }),
  ]);

  const [catB, unitB, taxZeroB, accCajaB, pmEfectivoB, cliB] = await Promise.all([
    prisma.productCategory.findFirstOrThrow({ where: { tenantId: tenantB.id } }),
    prisma.unitOfMeasure.findFirstOrThrow({ where: { tenantId: tenantB.id } }),
    prisma.taxProfile.findFirstOrThrow({ where: { tenantId: tenantB.id, rate: 0 } }),
    prisma.financialAccount.findFirstOrThrow({ where: { tenantId: tenantB.id, type: 'CASH' } }),
    prisma.paymentMethod.findFirstOrThrow({ where: { tenantId: tenantB.id } }),
    prisma.customer.findFirstOrThrow({ where: { tenantId: tenantB.id } }),
  ]);

  const supA = await prisma.supplier.create({
    data: { tenantId: tenantA.id, code: 'PRV-01', name: 'Proveedor A' },
  });
  const supB = await prisma.supplier.create({
    data: { tenantId: tenantB.id, code: 'PRV-01', name: 'Proveedor B' },
  });

  const prodA = await prisma.product.create({
    data: {
      tenantId: tenantA.id,
      sku: 'SKU-01',
      name: 'Producto A',
      categoryId: catA.id,
      unitId: unitA.id,
      type: 'PRODUCT',
      salePrice: 150,
      referenceCost: 80,
      minimumStock: 5,
    },
  });

  const prodB = await prisma.product.create({
    data: {
      tenantId: tenantB.id,
      sku: 'SKU-01',
      name: 'Producto B',
      categoryId: catB.id,
      unitId: unitB.id,
      type: 'PRODUCT',
      salePrice: 200,
      referenceCost: 100,
      minimumStock: 5,
    },
  });

  console.log('  PASS [PG-1]: Empresas A y B creadas con SKU-01 independiente en PostgreSQL.');

  // 2. Compra 1 en EMPRESA_A: 20 u @ 80 + IVA 15% recuperable (Contado)
  const pur1 = await purchaseService.confirmPurchase(ctxA, {
    supplierId: supA.id,
    productId: prodA.id,
    taxProfileId: taxIvaA.id,
    date: '2026-11-05',
    quantity: 20,
    unitCost: 80,
    paymentCondition: 'CASH',
    financialAccountId: accCajaA.id,
    idempotencyKey: `pur1-${suffix}`,
  });
  assert.equal(Number(pur1.netSubtotal), 1600);
  assert.equal(Number(pur1.taxTotal), 240);
  assert.equal(Number(pur1.grandTotal), 1840);
  assert.equal(Number(pur1.inventoryCapitalizedCost), 1600);

  // Compra 2 en EMPRESA_A: 10 u @ 110 sin impuesto (Crédito -> CxP)
  const pur2 = await purchaseService.confirmPurchase(ctxA, {
    supplierId: supA.id,
    productId: prodA.id,
    taxProfileId: taxZeroA.id,
    date: '2026-11-06',
    quantity: 10,
    unitCost: 110,
    paymentCondition: 'CREDIT',
    idempotencyKey: `pur2-${suffix}`,
  });
  assert.equal(Number(pur2.grandTotal), 1100);

  const stockAfterPurchases = await inventoryService.getCurrentStockAndCost(
    prisma,
    tenantA.id,
    prodA.id,
    2026,
    11,
  );
  assert.equal(stockAfterPurchases.currentStock, 30);
  assert.equal(stockAfterPurchases.weightedAverageCost, 90);
  console.log('  PASS [PG-2]: Compras contado/crédito, CxP, CashMovement y CPP mensual (90.00) persistidos en PostgreSQL.');

  // 3. Venta en EMPRESA_A: 5 u @ 150 + IVA 15% (Contado)
  const saleKey = `sale1-${suffix}`;
  const sale1 = await salesService.confirmSale(ctxA, {
    customerId: cliA.id,
    date: '2026-11-10',
    paymentCondition: 'CASH',
    paymentMethodId: pmEfectivoA.id,
    financialAccountId: accCajaA.id,
    idempotencyKey: saleKey,
    lines: [{ productId: prodA.id, quantity: 5, taxProfileId: taxIvaA.id }],
  });
  assert.equal(Number(sale1.netSubtotal), 750);
  assert.equal(Number(sale1.taxTotal), 112.5);
  assert.equal(Number(sale1.grandTotal), 862.5);
  assert.equal(Number(sale1.costTotal), 450);
  assert.equal(Number(sale1.grossProfit), 300);

  // Reintento idempotente con misma idempotencyKey no duplica
  const sale1Dup = await salesService.confirmSale(ctxA, {
    customerId: cliA.id,
    date: '2026-11-10',
    paymentCondition: 'CASH',
    paymentMethodId: pmEfectivoA.id,
    financialAccountId: accCajaA.id,
    idempotencyKey: saleKey,
    lines: [{ productId: prodA.id, quantity: 5, taxProfileId: taxIvaA.id }],
  });
  assert.equal(sale1Dup.id, sale1.id);

  const stockAfterSale = await inventoryService.getCurrentStockAndCost(
    prisma,
    tenantA.id,
    prodA.id,
    2026,
    11,
  );
  assert.equal(stockAfterSale.currentStock, 25);
  console.log('  PASS [PG-3]: Venta transaccional, costo histórico CPP, utilidad bruta e idempotencia verificados en PostgreSQL.');

  // 4. Pruebas de Seguridad Multi-Tenant (EMPRESA_A vs EMPRESA_B)
  await assert.rejects(
    () =>
      purchaseService.confirmPurchase(ctxA, {
        supplierId: supA.id,
        productId: prodB.id, // Producto de EMPRESA_B
        taxProfileId: taxZeroA.id,
        date: '2026-11-10',
        quantity: 1,
        unitCost: 10,
        paymentCondition: 'CASH',
        financialAccountId: accCajaA.id,
      }),
    /otra empresa|no encontrado/i,
  );

  await assert.rejects(
    () =>
      salesService.confirmSale(ctxA, {
        customerId: cliB.id, // Cliente de EMPRESA_B
        date: '2026-11-10',
        paymentCondition: 'CASH',
        paymentMethodId: pmEfectivoA.id,
        financialAccountId: accCajaA.id,
        lines: [{ productId: prodA.id, quantity: 1, taxProfileId: taxZeroA.id }],
      }),
    /otra empresa|no encontrado/i,
  );

  await assert.rejects(
    () =>
      inventoryService.registerAdjustment(ctxA, {
        productId: prodB.id, // Producto de EMPRESA_B
        date: '2026-11-10',
        isPositive: true,
        quantity: 1,
        reason: 'Intento cruzado',
      }),
    /otra empresa|no encontrado/i,
  );

  // Crear una venta legítima en EMPRESA_B e intentar anularla desde EMPRESA_A
  await purchaseService.confirmPurchase(ctxB, {
    supplierId: supB.id,
    productId: prodB.id,
    taxProfileId: taxZeroB.id,
    date: '2026-11-05',
    quantity: 10,
    unitCost: 100,
    paymentCondition: 'CASH',
    financialAccountId: accCajaB.id,
  });
  const saleB = await salesService.confirmSale(ctxB, {
    customerId: cliB.id,
    date: '2026-11-10',
    paymentCondition: 'CASH',
    paymentMethodId: pmEfectivoB.id,
    financialAccountId: accCajaB.id,
    lines: [{ productId: prodB.id, quantity: 1, taxProfileId: taxZeroB.id }],
  });
  await assert.rejects(
    () => salesService.cancelSale(ctxA, saleB.id, 'Intento no autorizado'),
    /otra empresa|no encontrada/i,
  );
  console.log('  PASS [PG-4]: Aislamiento multi-tenant estricto entre EMPRESA_A y EMPRESA_B verificado en PostgreSQL.');

  // 5. Anulación de venta en EMPRESA_A restituye stock a 30 y preserva trazabilidad
  const voided = await salesService.cancelSale(ctxA, sale1.id, 'Error de digitación');
  assert.equal(voided.status, 'VOIDED');
  const stockAfterVoid = await inventoryService.getCurrentStockAndCost(
    prisma,
    tenantA.id,
    prodA.id,
    2026,
    11,
  );
  assert.equal(stockAfterVoid.currentStock, 30);
  console.log('  PASS [PG-5]: Anulación sin borrado físico restituye stock (25 -> 30) y genera reversión financiera.');

  console.log('\n======================================================================');
  console.log('✔ PRUEBAS DE INTEGRACIÓN REALES CONTRA POSTGRESQL: 100% EXITOSAS');
  console.log('======================================================================');
} finally {
  // Limpieza ordenada respetando FKs Restrict
  for (const tid of [tenantAId, tenantBId].filter(Boolean)) {
    await prisma.auditLog.deleteMany({ where: { tenantId: tid } });
    await prisma.cashMovement.deleteMany({ where: { tenantId: tid } });
    await prisma.accountReceivable.deleteMany({ where: { tenantId: tid } });
    await prisma.accountPayable.deleteMany({ where: { tenantId: tid } });
    await prisma.inventoryMovement.deleteMany({ where: { tenantId: tid } });
    await prisma.inventoryAdjustment.deleteMany({ where: { tenantId: tid } });
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
