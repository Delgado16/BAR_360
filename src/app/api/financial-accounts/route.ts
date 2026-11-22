import { FinancePostgresService } from '@/application/services/finance-pg.service';
import {
  apiError,
  apiSuccess,
  requirePermission,
  resolveTenantContext,
} from '@/infrastructure/auth/server-auth-guard';

const financeService = new FinancePostgresService();

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const tenantSlug = url.searchParams.get('tenant') ?? '';
    if (!tenantSlug) return apiError(new Error('El parámetro tenant es obligatorio.'));

    const ctx = await resolveTenantContext(request, tenantSlug);
    requirePermission(ctx, 'cash_accounts', 'VIEW');

    const balances = await financeService.listAccountBalances(ctx.tenantId);
    return apiSuccess(balances, { total: balances.length });
  } catch (err) {
    return apiError(err);
  }
}
