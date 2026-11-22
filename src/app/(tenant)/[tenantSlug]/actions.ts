'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import { prisma } from '@/infrastructure/database/prisma-client';
import { ensureTenantWorkspace } from '@/infrastructure/database/tenant-bootstrap';
import { PurchasesPostgresService } from '@/application/services/purchases-pg.service';
import { SalesPostgresService } from '@/application/services/sales-pg.service';
import { FinancePostgresService } from '@/application/services/finance-pg.service';
import { IntelligencePostgresService } from '@/application/services/intelligence-pg.service';
import { type AuthenticatedTenantContext } from '@/domain/policies/rbac.policy';
import {
  parseTableOrderMeta,
  serializeTableOrderMeta,
  type KitchenOrderStatus,
} from '@/lib/bar-table-meta';

const purchasesPgService = new PurchasesPostgresService();
const salesPgService = new SalesPostgresService();
const financePgService = new FinancePostgresService();
const intelligencePgService = new IntelligencePostgresService();

function buildWorkspaceContext(tenant: { id: string; slug: string; status: 'ACTIVE' | 'SUSPENDED' | 'TRIAL_EXPIRED' | 'ARCHIVED' }): AuthenticatedTenantContext {
  return {
    userId: '00000000-0000-0000-0000-000000000001',
    email: 'workspace@minegociopro360.com',
    platformRole: 'USER',
    tenantId: tenant.id,
    tenantSlug: tenant.slug,
    tenantStatus: tenant.status,
    roleCode: 'TENANT_OWNER',
  };
}

export interface ActionResult {
  ok: boolean;
  message: string;
  saleNumber?: string;
}

export async function createProductAction(
  tenantSlug: string,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const tenant = await ensureTenantWorkspace(tenantSlug);
    const sku = String(formData.get('sku') ?? '').trim().toUpperCase();
    const name = String(formData.get('name') ?? '').trim();
    const description = String(formData.get('description') ?? '').trim() || null;
    const categoryId = String(formData.get('categoryId') ?? '').trim();
    const unitId = String(formData.get('unitId') ?? '').trim();
    const type = String(formData.get('type') ?? 'PRODUCT') === 'SERVICE' ? 'SERVICE' : 'PRODUCT';
    const salePrice = Number(formData.get('salePrice') ?? 0);
    const referenceCost = Number(formData.get('referenceCost') ?? 0);
    const minimumStock = type === 'SERVICE' ? 0 : Number(formData.get('minimumStock') ?? 0);
    const preferredSupplierId = String(formData.get('preferredSupplierId') ?? '').trim() || null;

    if (!sku || !name || !categoryId || !unitId) {
      return { ok: false, message: 'SKU, nombre, categoría y unidad son obligatorios.' };
    }
    if (!Number.isFinite(salePrice) || salePrice < 0 || !Number.isFinite(referenceCost) || referenceCost < 0) {
      return { ok: false, message: 'Precio y costo deben ser valores numéricos válidos >= 0.' };
    }

    await prisma.product.create({
      data: {
        tenantId: tenant.id,
        sku,
        name,
        description,
        categoryId,
        unitId,
        type,
        salePrice,
        referenceCost,
        minimumStock,
        preferredSupplierId,
      },
    });

    revalidatePath(`/${tenantSlug}/products`);
    return { ok: true, message: `Producto ${sku} creado correctamente.` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error al crear producto';
    if (msg.includes('Unique constraint')) {
      return { ok: false, message: 'Ya existe un producto con ese SKU en esta empresa.' };
    }
    return { ok: false, message: msg };
  }
}

export async function createCustomerAction(
  tenantSlug: string,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const tenant = await ensureTenantWorkspace(tenantSlug);
    const name = String(formData.get('name') ?? '').trim();
    const phone = String(formData.get('phone') ?? '').trim() || null;
    const email = String(formData.get('email') ?? '').trim() || null;
    const creditDaysRaw = String(formData.get('creditDays') ?? '').trim();
    const creditDays = creditDaysRaw ? Number(creditDaysRaw) : null;

    if (!name) {
      return { ok: false, message: 'El nombre del cliente es obligatorio.' };
    }

    const count = await prisma.customer.count({ where: { tenantId: tenant.id } });
    const code = String(formData.get('code') ?? '').trim().toUpperCase() || `CLI-${String(count + 1).padStart(3, '0')}`;

    await prisma.customer.create({
      data: {
        tenantId: tenant.id,
        code,
        name,
        phone,
        email,
        creditDays,
        customerType: 'REGISTERED',
      },
    });

    revalidatePath(`/${tenantSlug}/customers`);
    revalidatePath(`/${tenantSlug}/sales`);
    return { ok: true, message: `Cliente ${name} (${code}) registrado.` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error al registrar cliente';
    if (msg.includes('Unique constraint')) {
      return { ok: false, message: 'Ya existe un cliente con ese código o nombre.' };
    }
    return { ok: false, message: msg };
  }
}

export async function createSupplierAction(
  tenantSlug: string,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const tenant = await ensureTenantWorkspace(tenantSlug);
    const name = String(formData.get('name') ?? '').trim();
    const contactName = String(formData.get('contactName') ?? '').trim() || null;
    const phone = String(formData.get('phone') ?? '').trim() || null;
    const email = String(formData.get('email') ?? '').trim() || null;
    const suppliedInfo = String(formData.get('suppliedInfo') ?? '').trim() || null;

    if (!name) {
      return { ok: false, message: 'El nombre del proveedor es obligatorio.' };
    }

    const count = await prisma.supplier.count({ where: { tenantId: tenant.id } });
    const code = String(formData.get('code') ?? '').trim().toUpperCase() || `PRV-${String(count + 1).padStart(3, '0')}`;

    await prisma.supplier.create({
      data: {
        tenantId: tenant.id,
        code,
        name,
        contactName,
        phone,
        email,
        suppliedInfo,
      },
    });

    revalidatePath(`/${tenantSlug}/suppliers`);
    revalidatePath(`/${tenantSlug}/purchases`);
    revalidatePath(`/${tenantSlug}/products`);
    return { ok: true, message: `Proveedor ${name} (${code}) registrado.` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error al registrar proveedor';
    if (msg.includes('Unique constraint')) {
      return { ok: false, message: 'Ya existe un proveedor con ese código o nombre.' };
    }
    return { ok: false, message: msg };
  }
}

export async function createPurchaseAction(
  tenantSlug: string,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const tenant = await ensureTenantWorkspace(tenantSlug);
    const ctx = buildWorkspaceContext(tenant);
    const supplierId = String(formData.get('supplierId') ?? '').trim();
    const productId = String(formData.get('productId') ?? '').trim();
    const taxProfileId = String(formData.get('taxProfileId') ?? '').trim();
    const financialAccountId = String(formData.get('financialAccountId') ?? '').trim() || null;
    const paymentCondition = String(formData.get('paymentCondition') ?? 'CASH') === 'CREDIT' ? 'CREDIT' : 'CASH';
    const quantity = Number(formData.get('quantity') ?? 0);
    const unitCost = Number(formData.get('unitCost') ?? 0);
    const discountPercentage = Number(formData.get('discountPercentage') ?? 0) / 100;
    const documentReference = String(formData.get('documentReference') ?? '').trim() || null;
    const date = String(formData.get('date') ?? new Date().toISOString().slice(0, 10));

    const purchase = await purchasesPgService.confirmPurchase(ctx, {
      supplierId,
      productId,
      taxProfileId,
      date,
      quantity,
      unitCost,
      discountPercentage,
      paymentCondition,
      financialAccountId,
      documentReference,
    });

    revalidatePath(`/${tenantSlug}/purchases`);
    revalidatePath(`/${tenantSlug}/inventory`);
    return {
      ok: true,
      message: `Compra ${purchase.purchaseNumber} registrada por ${Number(purchase.grandTotal).toFixed(2)} (CPP actualizado).`,
    };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Error al registrar compra' };
  }
}

export async function createSaleAction(
  tenantSlug: string,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const tenant = await ensureTenantWorkspace(tenantSlug);
    const ctx = buildWorkspaceContext(tenant);
    const customerId = String(formData.get('customerId') ?? '').trim();
    const productId = String(formData.get('productId') ?? '').trim();
    const taxProfileId = String(formData.get('taxProfileId') ?? '').trim();
    const paymentCondition = String(formData.get('paymentCondition') ?? 'CASH') === 'CREDIT' ? 'CREDIT' : 'CASH';
    const paymentMethodId = String(formData.get('paymentMethodId') ?? '').trim() || null;
    const financialAccountId = String(formData.get('financialAccountId') ?? '').trim() || null;
    const quantity = Number(formData.get('quantity') ?? 0);
    const unitPriceRaw = String(formData.get('unitPrice') ?? '').trim();
    const discountPercentage = Number(formData.get('discountPercentage') ?? 0) / 100;
    const date = String(formData.get('date') ?? new Date().toISOString().slice(0, 10));

    const sale = await salesPgService.confirmSale(ctx, {
      customerId,
      date,
      paymentCondition,
      paymentMethodId,
      financialAccountId,
      lines: [
        {
          productId,
          quantity,
          unitPrice: unitPriceRaw ? Number(unitPriceRaw) : undefined,
          discountPercentage,
          taxProfileId,
        },
      ],
    });

    revalidatePath(`/${tenantSlug}/sales`);
    revalidatePath(`/${tenantSlug}/inventory`);
    return {
      ok: true,
      message: `Venta ${sale.saleNumber} registrada por ${Number(sale.grandTotal).toFixed(2)}.`,
    };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Error al registrar venta' };
  }
}

export async function createPosSaleAction(
  tenantSlug: string,
  payload: {
    draftSaleId?: string | null;
    tableName?: string | null;
    notes?: string | null;
    customerId: string;
    date: string;
    paymentCondition: 'CASH' | 'CREDIT';
    paymentMethodId?: string | null;
    financialAccountId?: string | null;
    idempotencyKey: string;
    lines: Array<{
      productId: string;
      quantity: number;
      unitPrice: number;
      discountPercentage: number;
      taxProfileId: string;
    }>;
  },
): Promise<ActionResult> {
  try {
    const tenant = await ensureTenantWorkspace(tenantSlug);
    const ctx = buildWorkspaceContext(tenant);
    const sale = await salesPgService.confirmSale(ctx, payload);

    revalidatePath(`/${tenantSlug}/sales`);
    revalidatePath(`/${tenantSlug}/inventory`);
    revalidatePath(`/${tenantSlug}/dashboard`);
    revalidatePath(`/${tenantSlug}/cash`);
    revalidatePath(`/${tenantSlug}/receivables`);

    return {
      ok: true,
      saleNumber: sale.saleNumber,
      message: `Venta POS ${sale.saleNumber} confirmada por ${Number(sale.grandTotal).toFixed(2)}.`,
    };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Error al confirmar venta POS' };
  }
}

export async function saveTableDraftAction(
  tenantSlug: string,
  payload: {
    draftSaleId?: string | null;
    tableName: string;
    notes?: string | null;
    customerId: string;
    date: string;
    lines: Array<{
      productId: string;
      quantity: number;
      unitPrice: number;
      discountPercentage: number;
      taxProfileId: string;
    }>;
  },
): Promise<ActionResult> {
  try {
    const tenant = await ensureTenantWorkspace(tenantSlug);
    const ctx = buildWorkspaceContext(tenant);
    const draft = await salesPgService.saveTableOrderDraft(ctx, payload);

    revalidatePath(`/${tenantSlug}/sales`);
    revalidatePath(`/${tenantSlug}/kitchen`);
    return {
      ok: true,
      message: `Cuenta de ${draft.documentNumber} guardada abierta (${Number(draft.grandTotal).toFixed(2)}).`,
    };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Error al guardar cuenta en mesa' };
  }
}

export async function updateKitchenStatusAction(
  tenantSlug: string,
  saleId: string,
  kitchenStatus: KitchenOrderStatus,
): Promise<ActionResult> {
  try {
    const tenant = await ensureTenantWorkspace(tenantSlug);
    const sale = await prisma.sale.findFirst({
      where: { id: saleId, tenantId: tenant.id, status: 'DRAFT' },
    });
    if (!sale) {
      return { ok: false, message: 'La comanda ya fue cerrada o no existe.' };
    }
    const meta = parseTableOrderMeta(sale.notes);
    await prisma.sale.update({
      where: { id: sale.id },
      data: {
        notes: serializeTableOrderMeta({ ...meta, kitchenStatus }),
      },
    });
    revalidatePath(`/${tenantSlug}/kitchen`);
    revalidatePath(`/${tenantSlug}/sales`);
    return { ok: true, message: `Estado de cocina actualizado.` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Error al actualizar cocina' };
  }
}

export async function seedBarCatalogAction(tenantSlug: string): Promise<ActionResult> {
  try {
    const tenant = await ensureTenantWorkspace(tenantSlug);

    await prisma.productCategory.createMany({
      data: [
        { tenantId: tenant.id, name: 'Cervezas y Licores', sortOrder: 1 },
        { tenantId: tenant.id, name: 'Promociones y Cubetazos', sortOrder: 2 },
        { tenantId: tenant.id, name: 'Comida y Bocas', sortOrder: 3 },
      ],
      skipDuplicates: true,
    });

    const [categories, units] = await Promise.all([
      prisma.productCategory.findMany({ where: { tenantId: tenant.id } }),
      prisma.unitOfMeasure.findMany({ where: { tenantId: tenant.id } }),
    ]);

    const catByName = (n: string) =>
      categories.find((c) => c.name === n)?.id ?? categories[0]!.id;
    const unitByName = (n: string) =>
      units.find((u) => u.name === n)?.id ?? units[0]!.id;

    const barItems = [
      {
        sku: 'BAR-TONA',
        name: 'Cerveza Toña 1L',
        categoryId: catByName('Cervezas y Licores'),
        unitId: unitByName('Botella'),
        type: 'PRODUCT' as const,
        salePrice: 95,
        referenceCost: 60,
        minimumStock: 24,
      },
      {
        sku: 'BAR-CUB6',
        name: 'Cubetazo 6 Cervezas',
        categoryId: catByName('Promociones y Cubetazos'),
        unitId: unitByName('Caja'),
        type: 'PRODUCT' as const,
        salePrice: 320,
        referenceCost: 195,
        minimumStock: 10,
      },
      {
        sku: 'BAR-6PACK',
        name: 'Sixpack Cervezas Mixto',
        categoryId: catByName('Promociones y Cubetazos'),
        unitId: unitByName('Caja'),
        type: 'PRODUCT' as const,
        salePrice: 310,
        referenceCost: 190,
        minimumStock: 10,
      },
      {
        sku: 'BAR-COMBO',
        name: 'Combo Cubetazo + Nachos',
        categoryId: catByName('Promociones y Cubetazos'),
        unitId: unitByName('Unidad'),
        type: 'PRODUCT' as const,
        salePrice: 490,
        referenceCost: 270,
        minimumStock: 5,
      },
      {
        sku: 'BAR-ALITAS6',
        name: 'Alitas BBQ (6 pzs)',
        categoryId: catByName('Comida y Bocas'),
        unitId: unitByName('Unidad'),
        type: 'SERVICE' as const,
        salePrice: 220,
        referenceCost: 95,
        minimumStock: 0,
      },
      {
        sku: 'BAR-ALITAS12',
        name: 'Alitas Picantes (12 pzs)',
        categoryId: catByName('Comida y Bocas'),
        unitId: unitByName('Unidad'),
        type: 'SERVICE' as const,
        salePrice: 390,
        referenceCost: 175,
        minimumStock: 0,
      },
      {
        sku: 'BAR-NACHOS',
        name: 'Nachos Especiales con Carne',
        categoryId: catByName('Comida y Bocas'),
        unitId: unitByName('Unidad'),
        type: 'SERVICE' as const,
        salePrice: 240,
        referenceCost: 105,
        minimumStock: 0,
      },
      {
        sku: 'BAR-SERV',
        name: 'Descorche / Servicio Mesa VIP',
        categoryId: catByName('Servicios'),
        unitId: unitByName('Servicio'),
        type: 'SERVICE' as const,
        salePrice: 150,
        referenceCost: 0,
        minimumStock: 0,
      },
    ];

    for (const item of barItems) {
      await prisma.product.upsert({
        where: { tenantId_sku: { tenantId: tenant.id, sku: item.sku } },
        update: {
          type: item.type,
          minimumStock: item.minimumStock,
        },
        create: {
          tenantId: tenant.id,
          ...item,
        },
      });
    }

    revalidatePath(`/${tenantSlug}/sales`);
    revalidatePath(`/${tenantSlug}/products`);
    return {
      ok: true,
      message: 'Menú base de Bar cargado (Cervezas, Cubetazos, Sixpacks, Alitas, Nachos y Servicios).',
    };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Error al cargar menú de bar' };
  }
}

export async function createExpenseAction(
  tenantSlug: string,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const tenant = await ensureTenantWorkspace(tenantSlug);
    const ctx = buildWorkspaceContext(tenant);
    const expense = await financePgService.registerExpense(ctx, {
      categoryId: String(formData.get('categoryId') ?? '').trim(),
      taxProfileId: String(formData.get('taxProfileId') ?? '').trim(),
      date: String(formData.get('date') ?? new Date().toISOString().slice(0, 10)),
      description: String(formData.get('description') ?? '').trim(),
      netAmount: Number(formData.get('netAmount') ?? 0),
      paymentCondition: String(formData.get('paymentCondition') ?? 'CASH') === 'CREDIT' ? 'CREDIT' : 'CASH',
      paymentMethodId: String(formData.get('paymentMethodId') ?? '').trim() || null,
      financialAccountId: String(formData.get('financialAccountId') ?? '').trim() || null,
      receiptNumber: String(formData.get('receiptNumber') ?? '').trim() || null,
    });

    revalidatePath(`/${tenantSlug}/expenses`);
    revalidatePath(`/${tenantSlug}/payables`);
    revalidatePath(`/${tenantSlug}/cash`);
    return {
      ok: true,
      message: `Gasto ${expense.expenseNumber} registrado por ${Number(expense.totalAmount).toFixed(2)}.`,
    };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Error al registrar gasto' };
  }
}

export async function registerReceivablePaymentAction(
  tenantSlug: string,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const tenant = await ensureTenantWorkspace(tenantSlug);
    const ctx = buildWorkspaceContext(tenant);
    const payment = await financePgService.registerCustomerPayment(ctx, {
      accountReceivableId: String(formData.get('accountReceivableId') ?? '').trim(),
      date: String(formData.get('date') ?? new Date().toISOString().slice(0, 10)),
      amount: Number(formData.get('amount') ?? 0),
      paymentMethodId: String(formData.get('paymentMethodId') ?? '').trim(),
      financialAccountId: String(formData.get('financialAccountId') ?? '').trim(),
      reference: String(formData.get('reference') ?? '').trim() || null,
      notes: String(formData.get('notes') ?? '').trim() || null,
    });

    revalidatePath(`/${tenantSlug}/receivables`);
    revalidatePath(`/${tenantSlug}/cash`);
    return {
      ok: true,
      message: `Cobro ${payment.collectionNumber} registrado por ${Number(payment.amount).toFixed(2)}.`,
    };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Error al registrar cobro' };
  }
}

export async function registerPayablePaymentAction(
  tenantSlug: string,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const tenant = await ensureTenantWorkspace(tenantSlug);
    const ctx = buildWorkspaceContext(tenant);
    const payment = await financePgService.registerSupplierPayment(ctx, {
      accountPayableId: String(formData.get('accountPayableId') ?? '').trim(),
      date: String(formData.get('date') ?? new Date().toISOString().slice(0, 10)),
      amount: Number(formData.get('amount') ?? 0),
      paymentMethodId: String(formData.get('paymentMethodId') ?? '').trim(),
      financialAccountId: String(formData.get('financialAccountId') ?? '').trim(),
      reference: String(formData.get('reference') ?? '').trim() || null,
      notes: String(formData.get('notes') ?? '').trim() || null,
    });

    revalidatePath(`/${tenantSlug}/payables`);
    revalidatePath(`/${tenantSlug}/cash`);
    return {
      ok: true,
      message: `Pago ${payment.paymentNumber} registrado por ${Number(payment.amount).toFixed(2)}.`,
    };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Error al registrar pago' };
  }
}

export async function transferFundsAction(
  tenantSlug: string,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const tenant = await ensureTenantWorkspace(tenantSlug);
    const ctx = buildWorkspaceContext(tenant);
    const transfer = await financePgService.transferBetweenAccounts(ctx, {
      sourceAccountId: String(formData.get('sourceAccountId') ?? '').trim(),
      destinationAccountId: String(formData.get('destinationAccountId') ?? '').trim(),
      date: String(formData.get('date') ?? new Date().toISOString().slice(0, 10)),
      amount: Number(formData.get('amount') ?? 0),
      reference: String(formData.get('reference') ?? '').trim() || null,
      reason: String(formData.get('reason') ?? '').trim() || null,
    });

    revalidatePath(`/${tenantSlug}/movements`);
    revalidatePath(`/${tenantSlug}/cash`);
    return {
      ok: true,
      message: `Transferencia ${transfer.transferNumber} realizada por ${Number(transfer.amount).toFixed(2)}.`,
    };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Error al transferir fondos' };
  }
}

export async function registerCashAdjustmentAction(
  tenantSlug: string,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const tenant = await ensureTenantWorkspace(tenantSlug);
    const ctx = buildWorkspaceContext(tenant);
    const adj = await financePgService.registerCashAdjustment(ctx, {
      financialAccountId: String(formData.get('financialAccountId') ?? '').trim(),
      date: String(formData.get('date') ?? new Date().toISOString().slice(0, 10)),
      direction: String(formData.get('direction') ?? 'INFLOW') === 'OUTFLOW' ? 'OUTFLOW' : 'INFLOW',
      amount: Number(formData.get('amount') ?? 0),
      reason: String(formData.get('reason') ?? '').trim(),
    });

    revalidatePath(`/${tenantSlug}/movements`);
    revalidatePath(`/${tenantSlug}/cash`);
    return {
      ok: true,
      message: `Ajuste ${adj.adjustmentNumber} registrado por ${Number(adj.amount).toFixed(2)}.`,
    };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Error al registrar ajuste' };
  }
}

export async function runReconciliationAction(tenantSlug: string): Promise<ActionResult> {
  try {
    const tenant = await ensureTenantWorkspace(tenantSlug);
    const ctx = buildWorkspaceContext(tenant);
    const result = await intelligencePgService.runAndPersistReconciliation(ctx);
    revalidatePath(`/${tenantSlug}/reconciliations`);
    return {
      ok: true,
      message: `Conciliación ejecutada: ${result.okCount}/31 OK, ${result.reviewCount} por revisar, ${result.alertCount} alertas (${result.overallState}).`,
    };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Error al ejecutar conciliación' };
  }
}

export async function updateBusinessSettingsAction(
  tenantSlug: string,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const tenant = await ensureTenantWorkspace(tenantSlug);
    const tradeName = String(formData.get('tradeName') ?? '').trim();
    const operatingYear = Number(formData.get('operatingYear') ?? 2026);
    const analysisMonth = Number(formData.get('analysisMonth') ?? 11);
    const taxTreatment =
      String(formData.get('taxTreatment') ?? 'RECOVERABLE') === 'NON_RECOVERABLE'
        ? 'NON_RECOVERABLE'
        : 'RECOVERABLE';
    const allowNegativeStock = formData.get('allowNegativeStock') === 'on';

    if (!tradeName) {
      return { ok: false, message: 'El nombre comercial es obligatorio.' };
    }

    await prisma.businessSettings.update({
      where: { tenantId: tenant.id },
      data: {
        tradeName,
        operatingYear,
        analysisMonth,
        taxTreatment,
        allowNegativeStock,
      },
    });

    await prisma.tenant.update({
      where: { id: tenant.id },
      data: { tradeName },
    });

    revalidatePath(`/${tenantSlug}/settings`);
    revalidatePath(`/${tenantSlug}/dashboard`);
    revalidatePath(`/${tenantSlug}/inventory`);
    return { ok: true, message: 'Configuración guardada en PostgreSQL.' };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Error al guardar configuración' };
  }
}

export async function createTenantUserAction(
  tenantSlug: string,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const tenant = await ensureTenantWorkspace(tenantSlug);
    const fullName = String(formData.get('fullName') ?? '').trim();
    const email = String(formData.get('email') ?? '').trim().toLowerCase();
    const password = String(formData.get('password') ?? '');
    const roleChoice = String(formData.get('roleChoice') ?? 'CASHIER_SELLER');

    if (!fullName || !email || password.length < 6) {
      return {
        ok: false,
        message: 'Nombre completo, correo válido y contraseña de al menos 6 caracteres son obligatorios.',
      };
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl) {
      return { ok: false, message: 'NEXT_PUBLIC_SUPABASE_URL no configurado.' };
    }

    let supabaseAuthId = '';
    const isRealServiceKey =
      Boolean(serviceRoleKey) &&
      serviceRoleKey !== anonKey &&
      !serviceRoleKey!.startsWith('sb_publishable_');

    if (isRealServiceKey && serviceRoleKey) {
      const adminClient = createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      });

      if (createErr) {
        if (createErr.message.toLowerCase().includes('already')) {
          const { data: listed } = await adminClient.auth.admin.listUsers();
          const found = listed.users.find((u) => u.email?.toLowerCase() === email);
          if (!found) {
            return { ok: false, message: createErr.message };
          }
          supabaseAuthId = found.id;
        } else {
          return { ok: false, message: createErr.message };
        }
      } else if (created.user) {
        supabaseAuthId = created.user.id;
      }
    } else if (anonKey) {
      const publicClient = createClient(supabaseUrl, anonKey);
      const { data: signed, error: signErr } = await publicClient.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName } },
      });
      if (signErr || !signed.user) {
        return {
          ok: false,
          message:
            signErr?.message ??
            'Configura SUPABASE_SERVICE_ROLE_KEY (service_role) en .env para crear usuarios confirmados automáticamente.',
        };
      }
      supabaseAuthId = signed.user.id;
    } else {
      return { ok: false, message: 'Faltan credenciales de Supabase en .env.' };
    }

    const roleMeta =
      roleChoice === 'KITCHEN'
        ? { code: 'CUSTOM' as const, name: 'Cocina (Comandas)' }
        : roleChoice === 'TENANT_OWNER'
          ? { code: 'TENANT_OWNER' as const, name: 'Propietario' }
          : roleChoice === 'INVENTORY_MANAGER'
            ? { code: 'INVENTORY_MANAGER' as const, name: 'Encargado de Inventario' }
            : roleChoice === 'ACCOUNTANT_FINANCE'
              ? { code: 'ACCOUNTANT_FINANCE' as const, name: 'Contador / Finanzas' }
              : { code: 'CASHIER_SELLER' as const, name: 'Vendedor / Barra' };

    await prisma.$transaction(
      async (tx) => {
        const dbUser = await tx.user.upsert({
          where: { email },
          update: {
            fullName,
            supabaseAuthId,
            isActive: true,
          },
          create: {
            supabaseAuthId,
            email,
            fullName,
            platformRole: 'USER',
            isActive: true,
          },
        });

        let role = await tx.role.findFirst({
          where: {
            tenantId: tenant.id,
            code: roleMeta.code,
            name: roleMeta.name,
          },
        });

        if (!role) {
          role = await tx.role.create({
            data: {
              tenantId: tenant.id,
              code: roleMeta.code,
              name: roleMeta.name,
              isSystem: true,
            },
          });
        }

        await tx.tenantMembership.upsert({
          where: {
            tenantId_userId: {
              tenantId: tenant.id,
              userId: dbUser.id,
            },
          },
          update: {
            roleId: role.id,
            status: 'ACTIVE',
          },
          create: {
            tenantId: tenant.id,
            userId: dbUser.id,
            roleId: role.id,
            status: 'ACTIVE',
          },
        });
      },
      { maxWait: 10000, timeout: 25000 },
    );

    revalidatePath(`/${tenantSlug}/users`);
    return {
      ok: true,
      message: isRealServiceKey
        ? `Usuario ${email} creado como ${roleMeta.name} y listo para iniciar sesión.`
        : `Usuario ${email} creado como ${roleMeta.name}. (Nota: sin service_role key en .env puede requerir confirmar correo en Supabase).`,
    };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Error al crear usuario' };
  }
}
