import { z } from 'zod';
import { FinancePostgresService } from '@/application/services/finance-pg.service';
import {
  apiError,
  apiSuccess,
  requireActiveSubscription,
  requirePermission,
  resolveTenantContext,
} from '@/infrastructure/auth/server-auth-guard';

const paymentSchema = z.object({
  tenantSlug: z.string().min(1),
  accountPayableId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount: z.number().positive(),
  paymentMethodId: z.string().uuid(),
  financialAccountId: z.string().uuid(),
  reference: z.string().max(120).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
  idempotencyKey: z.string().max(120).nullable().optional(),
});

const financeService = new FinancePostgresService();

export async function POST(request: Request) {
  try {
    const body = paymentSchema.parse(await request.json());
    const ctx = await resolveTenantContext(request, body.tenantSlug);
    requirePermission(ctx, 'payables', 'CREATE');
    await requireActiveSubscription(ctx.tenantId);

    const payment = await financeService.registerSupplierPayment(ctx, body);
    return apiSuccess(payment, undefined, 201);
  } catch (err) {
    return apiError(err);
  }
}
