import { z } from 'zod';
import { FinancePostgresService } from '@/application/services/finance-pg.service';
import {
  apiError,
  apiSuccess,
  requireActiveSubscription,
  requirePermission,
  resolveTenantContext,
} from '@/infrastructure/auth/server-auth-guard';

const transferSchema = z.object({
  tenantSlug: z.string().min(1),
  sourceAccountId: z.string().uuid(),
  destinationAccountId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount: z.number().positive(),
  reference: z.string().max(120).nullable().optional(),
  reason: z.string().max(500).nullable().optional(),
});

const financeService = new FinancePostgresService();

export async function POST(request: Request) {
  try {
    const body = transferSchema.parse(await request.json());
    const ctx = await resolveTenantContext(request, body.tenantSlug);
    requirePermission(ctx, 'cash_transfers', 'CREATE');
    await requireActiveSubscription(ctx.tenantId);

    const transfer = await financeService.transferBetweenAccounts(ctx, body);
    return apiSuccess(transfer, undefined, 201);
  } catch (err) {
    return apiError(err);
  }
}
