import { prisma } from '@/infrastructure/database/prisma-client';
import {
  apiError,
  apiSuccess,
  requirePermission,
  resolveTenantContext,
} from '@/infrastructure/auth/server-auth-guard';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const tenantSlug = url.searchParams.get('tenant') ?? '';
    if (!tenantSlug) return apiError(new Error('El parámetro tenant es obligatorio.'));

    const ctx = await resolveTenantContext(request, tenantSlug);
    requirePermission(ctx, 'payables', 'VIEW');

    const items = await prisma.accountPayable.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: { dueDate: 'asc' },
    });

    return apiSuccess(items, { total: items.length });
  } catch (err) {
    return apiError(err);
  }
}
