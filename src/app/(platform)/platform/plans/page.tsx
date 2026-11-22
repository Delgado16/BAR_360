import React from 'react';
import { prisma } from '@/infrastructure/database/prisma-client';
import { PlatformShell } from '@/components/layout/platform-shell';
import { PlatformPlansSyncButton } from '@/components/modules/platform-plans-client';
import { INITIAL_SUBSCRIPTION_PLANS } from '../../../../../prisma/seed';

export const dynamic = 'force-dynamic';

export default async function PlatformPlansPage() {
  const dbPlans = await prisma.subscriptionPlan.findMany({
    orderBy: { monthlyPrice: 'asc' },
  });

  const displayPlans =
    dbPlans.length > 0
      ? dbPlans.map((p) => ({
          code: p.code,
          name: p.name,
          description: p.description ?? '',
          monthlyPrice: Number(p.monthlyPrice),
          annualPrice: Number(p.annualPrice),
          currencyCode: p.currencyCode,
          maxUsers: p.maxUsers,
          maxProducts: p.maxProducts,
          maxMonthlySales: p.maxMonthlySales,
        }))
      : INITIAL_SUBSCRIPTION_PLANS;

  return (
    <PlatformShell
      title="Planes Comerciales"
      subtitle={`Planes sincronizados en PostgreSQL: ${dbPlans.length}`}
      activeHref="/platform/plans"
    >
      <div className="mb-6">
        <PlatformPlansSyncButton />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {displayPlans.map((plan) => (
          <div
            key={plan.code}
            className="rounded-xl border border-slate-800 bg-slate-900 p-6 flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-white">{plan.name}</h3>
                <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                  {plan.code}
                </span>
              </div>
              <p className="mt-2 text-sm text-slate-400">{plan.description}</p>
              <div className="mt-4 text-2xl font-bold text-indigo-400">
                ${plan.monthlyPrice}{' '}
                <span className="text-xs font-normal text-slate-400">{plan.currencyCode} / mes</span>
              </div>
              <div className="text-xs text-slate-400 mt-1">
                Anual: ${plan.annualPrice} {plan.currencyCode}
              </div>
            </div>
            <ul className="mt-4 pt-4 border-t border-slate-800 text-xs text-slate-300 space-y-1">
              <li>• Usuarios máx.: {plan.maxUsers}</li>
              <li>• Productos máx.: {plan.maxProducts}</li>
              <li>• Ventas/mes máx.: {plan.maxMonthlySales}</li>
            </ul>
          </div>
        ))}
      </div>
    </PlatformShell>
  );
}
