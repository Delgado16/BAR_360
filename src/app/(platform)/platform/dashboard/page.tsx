import React from 'react';
import { prisma } from '@/infrastructure/database/prisma-client';
import { PlatformShell } from '@/components/layout/platform-shell';
import { INITIAL_SUBSCRIPTION_PLANS } from '../../../../../prisma/seed';

export const dynamic = 'force-dynamic';

export default async function PlatformGlobalDashboardPage() {
  const [tenantsCount, activeTenantsCount, usersCount, subsCount, recentAuditsCount] =
    await Promise.all([
      prisma.tenant.count(),
      prisma.tenant.count({ where: { status: 'ACTIVE' } }),
      prisma.user.count(),
      prisma.subscription.count({ where: { status: { in: ['ACTIVE', 'TRIALING'] } } }),
      prisma.auditLog.count(),
    ]);

  return (
    <PlatformShell
      title="Administración Global de la Plataforma"
      subtitle="Supervisión de empresas suscritas, planes comerciales y salud operativa del SaaS"
      activeHref="/platform/dashboard"
    >
      {/* KPIs Globales de Plataforma (sin exponer datos financieros privados de los tenants) */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
          <div className="text-xs uppercase text-slate-400 font-semibold">Empresas Registradas</div>
          <div className="mt-1 text-3xl font-bold font-mono text-white">{tenantsCount}</div>
          <div className="mt-1 text-xs text-emerald-400">{activeTenantsCount} activas</div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
          <div className="text-xs uppercase text-slate-400 font-semibold">Usuarios Totales</div>
          <div className="mt-1 text-3xl font-bold font-mono text-white">{usersCount}</div>
          <div className="mt-1 text-xs text-slate-400">Sincronizados con Auth</div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
          <div className="text-xs uppercase text-slate-400 font-semibold">Suscripciones Vigentes</div>
          <div className="mt-1 text-3xl font-bold font-mono text-indigo-400">{subsCount}</div>
          <div className="mt-1 text-xs text-slate-400">Activas o en prueba</div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
          <div className="text-xs uppercase text-slate-400 font-semibold">Eventos en Bitácora</div>
          <div className="mt-1 text-3xl font-bold font-mono text-white">{recentAuditsCount}</div>
          <div className="mt-1 text-xs text-slate-400">Auditoría inmutable</div>
        </div>
      </section>

      {/* Acceso Directo Sin Pago al Sistema Empresarial Completo */}
      <section className="mb-8 rounded-xl border border-emerald-700/60 bg-emerald-950/30 p-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              EDICIÓN LIBRE / PRUEBA COMPLETA SIN PAGO
            </span>
            <h2 className="mt-2 text-lg font-bold text-white">
              Explora todas las funciones del sistema empresarial sin restricciones
            </h2>
            <p className="mt-1 text-sm text-slate-300">
              Accede directamente al panel operativo del Bar con Cocina, POS, Mesas, Comandas, Inventario CPP, Finanzas y Controles.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 shrink-0">
            <a
              href="/fronteras-bar/sales"
              className="px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition-colors"
            >
              Abrir POS Bar (Fronteras Bar)
            </a>
            <a
              href="/fronteras-bar/dashboard"
              className="px-4 py-2.5 rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-200 text-sm font-semibold transition-colors"
            >
              Dashboard Empresarial
            </a>
          </div>
        </div>
      </section>

      {/* Planes Comerciales Configurables */}
      <section className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Planes Comerciales Activos</h2>
          <a href="/platform/plans" className="text-xs text-indigo-400 hover:underline">
            Administrar planes →
          </a>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {INITIAL_SUBSCRIPTION_PLANS.map((plan) => (
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
                <p className="mt-2 text-xs text-slate-400">{plan.description}</p>
                <div className="mt-4 text-2xl font-bold text-indigo-400">
                  ${plan.monthlyPrice}/mes{' '}
                  <span className="text-xs font-normal text-slate-400">
                    (${plan.annualPrice}/año)
                  </span>
                </div>
              </div>
              <ul className="mt-4 pt-4 border-t border-slate-800 text-xs text-slate-300 space-y-1.5">
                <li>• Hasta {plan.maxUsers} usuarios</li>
                <li>• Hasta {plan.maxProducts.toLocaleString()} productos/servicios</li>
                <li>• Hasta {plan.maxMonthlySales.toLocaleString()} ventas/mes</li>
                <li>• Prueba gratuita: {plan.trialDays} días</li>
              </ul>
            </div>
          ))}
        </div>
      </section>
    </PlatformShell>
  );
}
