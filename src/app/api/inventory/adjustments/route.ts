import { z } from 'zod';
import { InventoryPostgresService } from '@/application/services/inventory-pg.service';
import {
  apiError,
  apiSuccess,
  requireActiveSubscription,
  requirePermission,
  resolveTenantContext,
} from '@/infrastructure/auth/server-auth-guard';

const adjustmentSchema = z.object({
  tenantSlug: z.string().min(1),
  productId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  isPositive: z.boolean(),
  reasonType: z
    .enum(['SHRINKAGE', 'SURPLUS', 'PHYSICAL_COUNT', 'CORRECTION'])
    .optional(),
  quantity: z.number().positive(),
  reason: z.string().min(3).max(500),
  relatedDocumentRef: z.string().max(120).optional(),
});

const inventoryService = new InventoryPostgresService();

export async function POST(request: Request) {
  try {
    const body = adjustmentSchema.parse(await request.json());
    const ctx = await resolveTenantContext(request, body.tenantSlug);
    requirePermission(ctx, 'inventory_adjustments', 'CREATE');
    await requireActiveSubscription(ctx.tenantId);

    const adjustment = await inventoryService.registerAdjustment(ctx, body);
    return apiSuccess(adjustment, undefined, 201);
  } catch (err) {
    return apiError(err);
  }
}
