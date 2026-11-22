import { z } from 'zod';
import { prisma } from '@/infrastructure/database/prisma-client';
import { PurchasesPostgresService } from '@/application/services/purchases-pg.service';
import {
  apiError,
  apiSuccess,
  requireActiveSubscription,
  requirePermission,
  resolveTenantContext,
} from '@/infrastructure/auth/server-auth-guard';

const createPurchaseSchema = z.object({
  tenantSlug: z.string().min(1),
  supplierId: z.string().uuid(),
  productId: z.string().uuid(),
  taxProfileId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  quantity: z.number().positive(),
  unitCost: z.number().nonnegative(),
  discountPercentage: z.number().min(0).lt(1).optional(),
  paymentCondition: z.enum(['CASH', 'CREDIT']),
  financialAccountId: z.string().uuid().nullable().optional(),
  documentReference: z.string().max(120).nullable().optional(),
  idempotencyKey: z.string().max(120).nullable().optional(),
});

const purchaseService = new PurchasesPostgresService();

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const tenantSlug = url.searchParams.get('tenant') ?? '';
    if (!tenantSlug) return apiError(new Error('El parámetro tenant es obligatorio.'));

    const ctx = await resolveTenantContext(request, tenantSlug);
    requirePermission(ctx, 'purchases', 'VIEW');

    const page = Math.max(1, Number(url.searchParams.get('page') ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get('pageSize') ?? 25)));

    const [items, total] = await Promise.all([
      prisma.purchase.findMany({
        where: { tenantId: ctx.tenantId },
        include: { supplier: true, items: true },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.purchase.count({ where: { tenantId: ctx.tenantId } }),
    ]);

    return apiSuccess(items, { page, pageSize, total });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(request: Request) {
  try {
    const body = createPurchaseSchema.parse(await request.json());
    const ctx = await resolveTenantContext(request, body.tenantSlug);
    requirePermission(ctx, 'purchases', 'CREATE');
    await requireActiveSubscription(ctx.tenantId);

    const purchase = await purchaseService.confirmPurchase(ctx, body);
    return apiSuccess(purchase, undefined, 201);
  } catch (err) {
    return apiError(err);
  }
}
