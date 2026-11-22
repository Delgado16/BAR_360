import React from 'react';
import { prisma } from '@/infrastructure/database/prisma-client';
import { PlatformShell } from '@/components/layout/platform-shell';
import { PlatformPlansSyncButton } from '@/components/modules/platform-plans-client';

export const dynamic = 'force-dynamic';

export default async function PlatformSettingsPage() {
  const currenciesCount = await prisma.currency.count();
  const billingBypass = process.env.DISABLE_SUBSCRIPTION_LIMITS === 'true';
  const webhookConfigured = Boolean(process.env.BILLING_WEBHOOK_SECRET);

  return (
    <PlatformShell
      title="Configuración de Plataforma"
      subtitle="Estado real de variables de entorno, monedas y políticas de seguridad del SaaS"
      activeHref="/platform/settings"
    >
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-6 space-y-5 max-w-2xl">
        <div className="space-y-2 text-sm">
          <div className="flex justify-between py-2 border-b border-slate-800">
            <span className="text-slate-400">Monedas activas en PostgreSQL:</span>
            <span className="font-mono font-semibold text-white">{currenciesCount}</span>
          </div>
          <div className="flex justify-between py-2 border-b border-slate-800">
            <span className="text-slate-400">Modo Evaluación Sin Pago (`DISABLE_SUBSCRIPTION_LIMITS`):</span>
            <span className="font-mono font-semibold text-emerald-400">
              {billingBypass ? 'ACTIVO (true)' : 'DESACTIVADO'}
            </span>
          </div>
          <div className="flex justify-between py-2 border-b border-slate-800">
            <span className="text-slate-400">Webhook HMAC (`BILLING_WEBHOOK_SECRET`):</span>
            <span className="font-mono font-semibold text-white">
              {webhookConfigured ? 'Configurado' : 'No configurado'}
            </span>
          </div>
        </div>

        <PlatformPlansSyncButton />
      </div>
    </PlatformShell>
  );
}
