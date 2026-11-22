import { prisma } from '@/infrastructure/database/prisma-client';
import { IntelligencePostgresService } from '@/application/services/intelligence-pg.service';
import {
  apiError,
  apiSuccess,
  requirePermission,
  resolveTenantContext,
} from '@/infrastructure/auth/server-auth-guard';

const intelligenceService = new IntelligencePostgresService();

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const tenantSlug = url.searchParams.get('tenant') ?? '';
    if (!tenantSlug) return apiError(new Error('El parámetro tenant es obligatorio.'));

    const ctx = await resolveTenantContext(request, tenantSlug);
    requirePermission(ctx, 'cash_flow', 'VIEW');

    const settings = await prisma.businessSettings.findUnique({ where: { tenantId: ctx.tenantId } });
    const year = Number(url.searchParams.get('year') ?? settings?.operatingYear ?? 2026);
    const report = await intelligenceService.getCashFlowReport(ctx.tenantId, year);
    return apiSuccess(report);
  } catch (err) {
    return apiError(err);
  }
}
