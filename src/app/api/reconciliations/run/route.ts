import { z } from 'zod';
import { IntelligencePostgresService } from '@/application/services/intelligence-pg.service';
import {
  apiError,
  apiSuccess,
  requirePermission,
  resolveTenantContext,
} from '@/infrastructure/auth/server-auth-guard';

const runSchema = z.object({
  tenantSlug: z.string().min(1),
});

const intelligenceService = new IntelligencePostgresService();

export async function POST(request: Request) {
  try {
    const body = runSchema.parse(await request.json());
    const ctx = await resolveTenantContext(request, body.tenantSlug);
    requirePermission(ctx, 'reconciliations', 'CREATE');

    const result = await intelligenceService.runAndPersistReconciliation(ctx);
    return apiSuccess(result, undefined, 201);
  } catch (err) {
    return apiError(err);
  }
}
