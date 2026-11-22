'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/infrastructure/database/prisma-client';
import { ensureTenantWorkspace } from '@/infrastructure/database/tenant-bootstrap';
import { INITIAL_CURRENCIES, INITIAL_SUBSCRIPTION_PLANS } from '../../../../prisma/seed';

export interface PlatformActionResult {
  ok: boolean;
  message: string;
}

export async function createPlatformTenantAction(
  formData: FormData,
): Promise<PlatformActionResult> {
  try {
    const rawName = String(formData.get('tradeName') ?? '').trim();
    const rawSlug = String(formData.get('slug') ?? '').trim().toLowerCase();
    const slug = (rawSlug || rawName)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    if (!slug) {
      return { ok: false, message: 'El nombre o identificador (slug) de la empresa es obligatorio.' };
    }

    const tenant = await ensureTenantWorkspace(slug);
    if (rawName && tenant.tradeName !== rawName) {
      await prisma.tenant.update({
        where: { id: tenant.id },
        data: { tradeName: rawName, legalName: rawName },
      });
      await prisma.businessSettings.updateMany({
        where: { tenantId: tenant.id },
        data: { tradeName: rawName },
      });
    }

    await prisma.auditLog.create({
      data: {
        tenantId: tenant.id,
        action: 'PLATFORM_TENANT_CREATED',
        entityType: 'Tenant',
        entityId: tenant.id,
        afterJson: { slug, tradeName: rawName || tenant.tradeName },
      },
    });

    revalidatePath('/platform/tenants');
    revalidatePath('/platform/dashboard');
    return { ok: true, message: `Empresa "${rawName || tenant.tradeName}" lista (/${slug}/dashboard).` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Error al crear empresa' };
  }
}

export async function toggleTenantStatusAction(
  tenantId: string,
  nextStatus: 'ACTIVE' | 'SUSPENDED',
): Promise<PlatformActionResult> {
  try {
    const tenant = await prisma.tenant.update({
      where: { id: tenantId },
      data: {
        status: nextStatus,
        suspendedAt: nextStatus === 'SUSPENDED' ? new Date() : null,
        suspendReason: nextStatus === 'SUSPENDED' ? 'Suspendida desde Panel de Plataforma' : null,
      },
    });

    await prisma.auditLog.create({
      data: {
        tenantId: tenant.id,
        action: nextStatus === 'SUSPENDED' ? 'TENANT_SUSPENDED' : 'TENANT_ACTIVATED',
        entityType: 'Tenant',
        entityId: tenant.id,
        afterJson: { status: nextStatus },
      },
    });

    revalidatePath('/platform/tenants');
    revalidatePath('/platform/dashboard');
    return {
      ok: true,
      message: `Empresa "${tenant.tradeName}" actualizada a ${nextStatus}.`,
    };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Error al cambiar estado' };
  }
}

export async function toggleUserActiveAction(
  userId: string,
  nextActive: boolean,
): Promise<PlatformActionResult> {
  try {
    const user = await prisma.user.update({
      where: { id: userId },
      data: { isActive: nextActive },
    });

    await prisma.auditLog.create({
      data: {
        action: nextActive ? 'PLATFORM_USER_ACTIVATED' : 'PLATFORM_USER_DEACTIVATED',
        entityType: 'User',
        entityId: user.id,
        afterJson: { email: user.email, isActive: nextActive },
      },
    });

    revalidatePath('/platform/users');
    return { ok: true, message: `Usuario ${user.email} ${nextActive ? 'activado' : 'desactivado'}.` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Error al actualizar usuario' };
  }
}

export async function syncPlatformPlansAction(): Promise<PlatformActionResult> {
  try {
    for (const c of INITIAL_CURRENCIES) {
      await prisma.currency.upsert({
        where: { code: c.code },
        update: { name: c.name, symbol: c.symbol, decimalPlaces: c.decimalPlaces },
        create: c,
      });
    }

    for (const p of INITIAL_SUBSCRIPTION_PLANS) {
      await prisma.subscriptionPlan.upsert({
        where: { code: p.code },
        update: {
          name: p.name,
          description: p.description,
          monthlyPrice: p.monthlyPrice,
          annualPrice: p.annualPrice,
          currencyCode: p.currencyCode,
          trialDays: p.trialDays,
          maxUsers: p.maxUsers,
          maxProducts: p.maxProducts,
          maxMonthlySales: p.maxMonthlySales,
          featuresJson: p.featuresJson,
        },
        create: p,
      });
    }

    revalidatePath('/platform/plans');
    revalidatePath('/platform/subscriptions');
    revalidatePath('/platform/settings');
    return { ok: true, message: 'Planes comerciales y monedas sincronizados en PostgreSQL.' };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Error al sincronizar planes' };
  }
}

export async function assignTenantSubscriptionAction(
  formData: FormData,
): Promise<PlatformActionResult> {
  try {
    const tenantId = String(formData.get('tenantId') ?? '').trim();
    const planId = String(formData.get('planId') ?? '').trim();
    const billingInterval =
      String(formData.get('billingInterval') ?? 'MONTHLY') === 'ANNUAL' ? 'ANNUAL' : 'MONTHLY';
    const status =
      String(formData.get('status') ?? 'ACTIVE') === 'TRIALING'
        ? 'TRIALING'
        : String(formData.get('status')) === 'SUSPENDED'
          ? 'SUSPENDED'
          : 'ACTIVE';

    if (!tenantId || !planId) {
      return { ok: false, message: 'Selecciona una empresa y un plan.' };
    }

    const now = new Date();
    const periodEnd = new Date(
      now.getTime() + (billingInterval === 'ANNUAL' ? 365 : 30) * 86400000,
    );

    const existing = await prisma.subscription.findFirst({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });

    if (existing) {
      await prisma.subscription.update({
        where: { id: existing.id },
        data: { planId, billingInterval, status, currentPeriodEnd: periodEnd },
      });
    } else {
      await prisma.subscription.create({
        data: {
          tenantId,
          planId,
          billingInterval,
          status,
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
        },
      });
    }

    await prisma.auditLog.create({
      data: {
        tenantId,
        action: 'SUBSCRIPTION_UPDATED_BY_PLATFORM',
        entityType: 'Subscription',
        afterJson: { planId, billingInterval, status },
      },
    });

    revalidatePath('/platform/subscriptions');
    revalidatePath('/platform/dashboard');
    return { ok: true, message: 'Suscripción asignada / actualizada en PostgreSQL.' };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Error al asignar suscripción' };
  }
}

export async function createSupportIncidentAction(
  formData: FormData,
): Promise<PlatformActionResult> {
  try {
    const tenantId = String(formData.get('tenantId') ?? '').trim() || null;
    const reason = String(formData.get('reason') ?? '').trim();
    if (reason.length < 5) {
      return { ok: false, message: 'Describe la incidencia o ticket de soporte (mín. 5 caracteres).' };
    }

    await prisma.auditLog.create({
      data: {
        tenantId,
        action: 'SUPPORT_INCIDENT_LOGGED',
        entityType: 'SupportIncident',
        reason,
        isSupportAccess: Boolean(tenantId),
      },
    });

    revalidatePath('/platform/incidents');
    revalidatePath('/platform/audit');
    return { ok: true, message: 'Incidencia / ticket registrado en la bitácora auditada.' };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Error al registrar incidencia' };
  }
}
