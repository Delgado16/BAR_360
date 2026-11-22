import { z } from 'zod';
import { prisma } from '@/infrastructure/database/prisma-client';
import { FinancePostgresService } from '@/application/services/finance-pg.service';
import {
  apiError,
  apiSuccess,
  requireActiveSubscription,
  requirePermission,
  resolveTenantContext,
} from '@/infrastructure/auth/server-auth-guard';

const createExpenseSchema = z.object({
  tenantSlug: z.string().min(1),
  categoryId: z.string().uuid(),
  taxProfileId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: z.string().min(1).max(500),
  netAmount: z.number().positive(),
  paymentCondition: z.enum(['CASH', 'CREDIT']),
  paymentMethodId: z.string().uuid().nullable().optional(),
  financialAccountId: z.string().uuid().nullable().optional(),
  receiptNumber: z.string().max(120).nullable().optional(),
  idempotencyKey: z.string().max(120).nullable().optional(),
});

const financeService = new FinancePostgresService();

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const tenantSlug = url.searchParams.get('tenant') ?? '';
    if (!tenantSlug) return apiError(new Error('El parámetro tenant es obligatorio.'));

    const ctx = await resolveTenantContext(request, tenantSlug);
    requirePermission(ctx, 'expenses', 'VIEW');

    const items = await prisma.operatingExpense.findMany({
      where: { tenantId: ctx.tenantId },
      include: { category: true },
      orderBy: { date: 'desc' },
    });

    return apiSuccess(items, { total: items.length });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(request: Request) {
  try {
    const body = createExpenseSchema.parse(await request.json());
    const ctx = await resolveTenantContext(request, body.tenantSlug);
    requirePermission(ctx, 'expenses', 'CREATE');
    await requireActiveSubscription(ctx.tenantId);

    const expense = await financeService.registerExpense(ctx, body);
    return apiSuccess(expense, undefined, 201);
  } catch (err) {
    return apiError(err);
  }
}
