import { prisma } from '@/infrastructure/database/prisma-client';
import { InventoryPostgresService } from '@/application/services/inventory-pg.service';
import {
  apiError,
  apiSuccess,
  requirePermission,
  resolveTenantContext,
} from '@/infrastructure/auth/server-auth-guard';

const inventoryService = new InventoryPostgresService();

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const tenantSlug = url.searchParams.get('tenant') ?? '';
    if (!tenantSlug) return apiError(new Error('El parámetro tenant es obligatorio.'));

    const ctx = await resolveTenantContext(request, tenantSlug);
    requirePermission(ctx, 'inventory', 'VIEW');

    const settings = await prisma.businessSettings.findUnique({ where: { tenantId: ctx.tenantId } });
    const year = Number(url.searchParams.get('year') ?? settings?.operatingYear ?? 2026);
    const month = Number(url.searchParams.get('month') ?? settings?.analysisMonth ?? 11);

    const valuation = await inventoryService.listInventoryValuation(ctx.tenantId, year, month);
    return apiSuccess(valuation, { year, month, total: valuation.length });
  } catch (err) {
    return apiError(err);
  }
}
