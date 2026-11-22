import { z } from 'zod';
import { prisma } from '@/infrastructure/database/prisma-client';
import {
  apiError,
  apiSuccess,
  requireActiveSubscription,
  requirePermission,
  resolveTenantContext,
} from '@/infrastructure/auth/server-auth-guard';

const createProductSchema = z.object({
  tenantSlug: z.string().min(1),
  sku: z.string().min(1).max(64),
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  categoryId: z.string().uuid(),
  unitId: z.string().uuid(),
  type: z.enum(['PRODUCT', 'SERVICE']).default('PRODUCT'),
  salePrice: z.number().nonnegative(),
  referenceCost: z.number().nonnegative().default(0),
  minimumStock: z.number().nonnegative().default(0),
  preferredSupplierId: z.string().uuid().nullable().optional(),
});

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const tenantSlug = url.searchParams.get('tenant') ?? '';
    if (!tenantSlug) {
      return apiError(new Error('El parámetro tenant es obligatorio.'));
    }

    const ctx = await resolveTenantContext(request, tenantSlug);
    requirePermission(ctx, 'products', 'VIEW');

    const page = Math.max(1, Number(url.searchParams.get('page') ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get('pageSize') ?? 25)));
    const search = (url.searchParams.get('q') ?? '').trim();

    const where = {
      tenantId: ctx.tenantId,
      ...(search
        ? {
            OR: [
              { sku: { contains: search, mode: 'insensitive' as const } },
              { name: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.product.findMany({
        where,
        include: { category: true, unit: true },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.product.count({ where }),
    ]);

    return apiSuccess(items, { page, pageSize, total });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(request: Request) {
  try {
    const body = createProductSchema.parse(await request.json());
    const ctx = await resolveTenantContext(request, body.tenantSlug);
    requirePermission(ctx, 'products', 'CREATE');
    await requireActiveSubscription(ctx.tenantId);

    const product = await prisma.product.create({
      data: {
        tenantId: ctx.tenantId,
        sku: body.sku.trim().toUpperCase(),
        name: body.name.trim(),
        description: body.description ?? null,
        categoryId: body.categoryId,
        unitId: body.unitId,
        type: body.type,
        salePrice: body.salePrice,
        referenceCost: body.referenceCost,
        minimumStock: body.type === 'SERVICE' ? 0 : body.minimumStock,
        preferredSupplierId: body.preferredSupplierId ?? null,
        createdBy: ctx.userId,
      },
    });

    return apiSuccess(product, undefined, 201);
  } catch (err) {
    return apiError(err);
  }
}
