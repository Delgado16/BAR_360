import assert from 'node:assert/strict';
import { type AuthenticatedTenantContext } from '../domain/policies/rbac.policy.ts';
import { EnterpriseSaaSEngine } from '../domain/services/enterprise-saas.service.ts';
import { CatalogsAndConfigService } from '../domain/services/catalogs-config.service.ts';
import { SubscriptionBillingService } from '../domain/services/subscription-billing.service.ts';
import {
  HmacWebhookBillingProvider,
  signWebhookPayloadForTest,
} from '../infrastructure/billing/billing-provider.ts';

console.log('======================================================================');
console.log('MI NEGOCIO PRO 360 — EJECUCIÓN DE PRUEBAS AUTOMATIZADAS (FASE 7)');
console.log('======================================================================\n');

const engine = new EnterpriseSaaSEngine();
const catalogService = new CatalogsAndConfigService(engine);
const billingService = new SubscriptionBillingService(engine);

const superAdminCtx: AuthenticatedTenantContext = {
  userId: 'root-admin',
  email: 'root@minegociopro360.com',
  platformRole: 'SUPER_ADMIN',
  tenantId: 'platform',
  tenantSlug: 'platform',
  tenantStatus: 'ACTIVE',
  roleCode: 'SUPER_ADMIN',
};

const ownerCtx: AuthenticatedTenantContext = {
  userId: 'owner-f7',
  email: 'dueno@fronterasbar.com',
  platformRole: 'USER',
  tenantId: 'tenant-f7-fronteras',
  tenantSlug: 'fronteras-bar',
  tenantStatus: 'ACTIVE',
  roleCode: 'TENANT_OWNER',
};

// 1. Configurar planes comerciales desde el Panel de Plataforma (no codificados)
billingService.upsertCommercialPlan(superAdminCtx, {
  id: 'plan-basic',
  code: 'BASIC',
  name: 'Básico',
  description: 'Plan inicial',
  monthlyPrice: 19,
  annualPrice: 190,
  currencyCode: 'USD',
  trialDays: 14,
  maxUsers: 2,
  maxProducts: 2, // Límite estricto para probar restricción de plan
  maxMonthlySales: 100,
  enabledFeatures: ['pos_sales', 'inventory_cpp'],
  isActive: true,
});

billingService.upsertCommercialPlan(superAdminCtx, {
  id: 'plan-pro',
  code: 'PRO',
  name: 'Profesional',
  description: 'Plan completo',
  monthlyPrice: 49,
  annualPrice: 490,
  currencyCode: 'USD',
  trialDays: 14,
  maxUsers: 10,
  maxProducts: 5000,
  maxMonthlySales: 25000,
  enabledFeatures: ['pos_sales', 'inventory_cpp', 'receivables_payables', 'reconciliations'],
  isActive: true,
});

// Inicializar empresa y asignar prueba gratuita de 14 días en plan BASIC
const seeded = catalogService.seedDefaultConfigurationForTenant(ownerCtx, {
  tradeName: 'Fronteras Bar',
  currencyCode: 'NIO',
});
const trialSub = billingService.startTrialSubscription(ownerCtx, ownerCtx.tenantId, 'BASIC', '2026-11-01');
assert.equal(trialSub.status, 'TRIALING');
assert.equal(trialSub.trialEndsAt, '2026-11-15');
console.log('  PASS: Planes configurables y prueba gratuita de 14 días iniciada (2026-11-01 -> 2026-11-15).');

// 2. Verificar cumplimiento estricto de límites del plan BASIC (maxProducts = 2)
const catBebidas = seeded.productCategories[1]!;
const cliMostrador = engine.createCustomer(ownerCtx, {
  id: 'cli-1',
  code: 'CLI-GEN',
  name: 'Cliente Mostrador',
  customerType: 'GENERIC',
});

const p1 = engine.createProduct(ownerCtx, {
  id: 'p-1',
  sku: 'SKU01',
  name: 'Producto 1',
  categoryId: catBebidas.id,
  type: 'PRODUCT',
  unitName: 'Unidad',
  salePrice: 100,
  referenceCost: 70,
  minimumStock: 5,
  openingStockQuantity: 20,
  openingUnitCost: 70,
});
engine.createProduct(ownerCtx, {
  id: 'p-2',
  sku: 'SKU02',
  name: 'Producto 2',
  categoryId: catBebidas.id,
  type: 'PRODUCT',
  unitName: 'Unidad',
  salePrice: 50,
  referenceCost: 30,
  minimumStock: 5,
  openingStockQuantity: 20,
  openingUnitCost: 30,
});

// El 3.er producto debe ser rechazado por límite del plan BASIC
assert.throws(
  () =>
    engine.createProduct(ownerCtx, {
      id: 'p-3',
      sku: 'SKU03',
      name: 'Producto 3',
      categoryId: catBebidas.id,
      type: 'PRODUCT',
      unitName: 'Unidad',
      salePrice: 20,
      referenceCost: 10,
      minimumStock: 5,
      openingStockQuantity: 0,
      openingUnitCost: 0,
    }),
  /límite de 2 productos\/servicios de su plan actual/
);
console.log('  PASS: Límite de plan BASIC (máx. 2 productos) aplicado en el servidor.');

// 3. Prueba #30: Suspensión controlada por impago -> NO borra datos, bloquea mutaciones, y Reactivación mediante Webhook HMAC
billingService.suspendSubscription(superAdminCtx, ownerCtx.tenantId, 'Factura vencida tras período de gracia');

// Los datos existentes permanecen intactos y accesibles en modo lectura
const existingProducts = engine.listProducts(ownerCtx);
assert.equal(existingProducts.length, 2);

// Las nuevas operaciones mutativas (ventas) quedan bloqueadas con error 402
assert.throws(
  () =>
    engine.registerSale(ownerCtx, {
      id: 'vta-blocked',
      saleNumber: 'VTA-BLK',
      customerId: cliMostrador.id,
      date: '2026-11-18',
      paymentCondition: 'CASH',
      paymentMethodId: seeded.paymentMethods[0]!.id,
      financialAccountId: seeded.financialAccounts[0]!.id,
      lines: [{ productId: p1.id, quantity: 1, unitPrice: 100, taxProfileId: seeded.taxProfiles[0]!.id }],
    }),
  /suscripción de la empresa está suspendida/
);
console.log('  PASS [Prueba #30a]: Suspensión controlada bloquea nuevas ventas pero conserva intactos los datos históricos.');

// 4. Webhook de pago válido con firma HMAC-SHA256 que actualiza a plan PRO y reactiva la empresa
const webhookSecret = 'whsec_test_secret_2026';
const provider = new HmacWebhookBillingProvider('generic_hmac_gateway');
const webhookBody = JSON.stringify({
  externalEventId: 'evt_paid_2026_001',
  eventType: 'invoice.paid',
  tenantId: ownerCtx.tenantId,
  planCode: 'PRO',
  billingInterval: 'ANNUAL',
  amount: 490,
  currencyCode: 'USD',
});

// Rechazar firma inválida
assert.throws(
  () =>
    billingService.processBillingWebhook(
      superAdminCtx,
      provider,
      webhookBody,
      'sha256=deadbeefdeadbeef',
      webhookSecret
    ),
  /Firma de webhook de facturación inválida/
);

// Procesar webhook válido
const validSig = signWebhookPayloadForTest(webhookBody, webhookSecret);
const firstRun = billingService.processBillingWebhook(
  superAdminCtx,
  provider,
  webhookBody,
  validSig,
  webhookSecret
);
assert.equal(firstRun.status, 'PROCESSED');

// Idempotencia: reenvío del mismo externalEventId debe ignorarse sin duplicar evento
const secondRun = billingService.processBillingWebhook(
  superAdminCtx,
  provider,
  webhookBody,
  validSig,
  webhookSecret
);
assert.equal(secondRun.status, 'DUPLICATE_IGNORED');

// Tras reactivación en plan PRO, la empresa vuelve a operar y ya puede crear el 3.er producto y registrar ventas
const p3 = engine.createProduct(ownerCtx, {
  id: 'p-3',
  sku: 'SKU03',
  name: 'Producto 3 (Tras Upgrade PRO)',
  categoryId: catBebidas.id,
  type: 'PRODUCT',
  unitName: 'Unidad',
  salePrice: 20,
  referenceCost: 10,
  minimumStock: 5,
  openingStockQuantity: 10,
  openingUnitCost: 10,
});
assert.equal(p3.sku, 'SKU03');

const saleAfterReactivation = engine.registerSale(ownerCtx, {
  id: 'vta-reactivated',
  saleNumber: 'VTA-0001',
  customerId: cliMostrador.id,
  date: '2026-11-20',
  paymentCondition: 'CASH',
  paymentMethodId: seeded.paymentMethods[0]!.id,
  financialAccountId: seeded.financialAccounts[0]!.id,
  lines: [{ productId: p1.id, quantity: 2, unitPrice: 100, taxProfileId: seeded.taxProfiles[0]!.id }],
});
assert.equal(saleAfterReactivation.grandTotal, 200);

const metrics = billingService.getPlatformGlobalMetrics(superAdminCtx);
assert.equal(metrics.activeSubscriptions, 1);
assert.equal(metrics.suspendedSubscriptions, 0);
console.log(
  '  PASS [Prueba #30b]: Webhook HMAC válido + idempotente reactiva suscripción en plan PRO anual y restaura operación completa.'
);

console.log('\n======================================================================');
console.log('RESULTADO FINAL: TODAS LAS PRUEBAS DE LA FASE 7 PASARON AL 100%');
console.log('======================================================================');
