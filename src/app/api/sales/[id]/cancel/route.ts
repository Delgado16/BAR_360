import { z } from 'zod';
import { SalesPostgresService } from '@/application/services/sales-pg.service';
import {
  apiError,
  apiSuccess,
  requirePermission,
  resolveTenantContext,
} from '@/infrastructure/auth/server-auth-guard';

const cancelSaleSchema = z.object({
  tenantSlug: z.string().min(1),
  reason: z.string().min(3).max(500),
});

const salesService = new SalesPostgresService();

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const body = cancelSaleSchema.parse(await request.json());
    const ctx = await resolveTenantContext(request, body.tenantSlug);
    requirePermission(ctx, 'sales', 'VOID');

    const voided = await salesService.cancelSale(ctx, id, body.reason);
    return apiSuccess(voided);
  } catch (err) {
    return apiError(err);
  }
}
