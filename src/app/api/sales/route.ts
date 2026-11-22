import { z } from 'zod';
import { prisma } from '@/infrastructure/database/prisma-client';
import { SalesPostgresService } from '@/application/services/sales-pg.service';
import {
  apiError,
  apiSuccess,
  requireActiveSubscription,
  requirePermission,
  resolveTenantContext,
} from '@/infrastructure/auth/server-auth-guard';

const saleLineSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().positive(),
  unitPrice: z.number().nonnegative().optional(),
  discountPercentage: z.number().min(0).lt(1).optional(),
  taxProfileId: z.string().uuid(),
});

const createSaleSchema = z.object({
  tenantSlug: z.string().min(1),
  customerId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  paymentCondition: z.enum(['CASH', 'CREDIT']),
  paymentMethodId: z.string().uuid().nullable().optional(),
  financialAccountId: z.string().uuid().nullable().optional(),
  creditDays: z.number().int().nonnegative().nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
  idempotencyKey: z.string().max(120).nullable().optional(),
  lines: z.array(saleLineSchema).min(1),
});

const salesService = new SalesPostgresService();

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const tenantSlug = url.searchParams.get('tenant') ?? '';
    if (!tenantSlug) return apiError(new Error('El parámetro tenant es obligatorio.'));

    const ctx = await resolveTenantContext(request, tenantSlug);
    requirePermission(ctx, 'sales', 'VIEW');

    const page = Math.max(1, Number(url.searchParams.get('page') ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get('pageSize') ?? 25)));

    const [items, total] = await Promise.all([
      prisma.sale.findMany({
        where: { tenantId: ctx.tenantId },
        include: { customer: true, items: true },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.sale.count({ where: { tenantId: ctx.tenantId } }),
    ]);

    return apiSuccess(items, { page, pageSize, total });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(request: Request) {
  try {
    const body = createSaleSchema.parse(await request.json());
    const ctx = await resolveTenantContext(request, body.tenantSlug);
    requirePermission(ctx, 'sales', 'CREATE');
    await requireActiveSubscription(ctx.tenantId);

    const sale = await salesService.confirmSale(ctx, body);
    return apiSuccess(sale, undefined, 201);
  } catch (err) {
    return apiError(err);
  }
}
