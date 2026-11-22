// ============================================================================
// MI NEGOCIO PRO 360 — FASE 7: SERVICIO DE COMERCIALIZACIÓN Y SUSCRIPCIONES SaaS
// Gestiona planes configurables desde el Panel de Plataforma, pruebas gratuitas,
// renovaciones mensuales/anuales, períodos de gracia, suspensión controlada y
// reactivación sin pérdida de datos, más procesamiento idempotente de webhooks.
// ============================================================================

import {
  type AuthenticatedTenantContext,
  AuthorizationError,
  assertTenantAccessAndPermission,
} from '../policies/rbac.policy.ts';
import { type PlanEntitlementCheckInput } from '../policies/tenant-isolation.policy.ts';
import { EnterpriseSaaSEngine } from './enterprise-saas.service.ts';
import {
  type BillingProvider,
  type BillingIntervalType,
} from '../../infrastructure/billing/billing-provider.ts';

export interface CommercialPlanEntity {
  id: string;
  code: string;
  name: string;
  description: string;
  monthlyPrice: number;
  annualPrice: number;
  currencyCode: string;
  trialDays: number;
  maxUsers: number;
  maxProducts: number;
  maxMonthlySales: number;
  enabledFeatures: string[];
  isActive: boolean;
}

export interface TenantSubscriptionRecord {
  id: string;
  tenantId: string;
  planId: string;
  planCode: string;
  status: 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'GRACE_PERIOD' | 'SUSPENDED' | 'CANCELED';
  billingInterval: BillingIntervalType;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  trialEndsAt: string | null;
  gracePeriodEndsAt: string | null;
  canceledAt: string | null;
  billingProvider: string;
  externalSubId?: string;
}

export interface SubscriptionEventLog {
  id: string;
  subscriptionId: string;
  eventType: string;
  previousStatus: string | null;
  newStatus: string;
  amount?: number;
  currencyCode?: string;
  createdAt: string;
}

export class SubscriptionBillingService {
  private plans = new Map<string, CommercialPlanEntity>();
  private subscriptionsByTenant = new Map<string, TenantSubscriptionRecord>();
  private subscriptionEvents: SubscriptionEventLog[] = [];
  private processedWebhookIds = new Set<string>();
  private readonly engine: EnterpriseSaaSEngine;

  constructor(engine: EnterpriseSaaSEngine) {
    this.engine = engine;
  }

  private assertPlatformAdmin(ctx: AuthenticatedTenantContext): void {
    if (ctx.roleCode !== 'SUPER_ADMIN') {
      throw new AuthorizationError(
        'Solo el Superadministrador de plataforma puede gestionar planes o suscripciones globales.',
        'PLATFORM_ADMIN_REQUIRED',
        403
      );
    }
  }

  // --------------------------------------------------------------------------
  // 1. Gestión de Planes Comerciales Configurables (No codificados)
  // --------------------------------------------------------------------------
  public upsertCommercialPlan(
    ctx: AuthenticatedTenantContext,
    plan: CommercialPlanEntity
  ): CommercialPlanEntity {
    this.assertPlatformAdmin(ctx);
    if (plan.monthlyPrice < 0 || plan.annualPrice < 0 || plan.maxUsers <= 0) {
      throw new Error('Precios o límites de plan inválidos.');
    }
    this.plans.set(plan.code, { ...plan });
    return plan;
  }

  public listActivePlans(): CommercialPlanEntity[] {
    return Array.from(this.plans.values()).filter((p) => p.isActive);
  }

  // --------------------------------------------------------------------------
  // 2. Ciclo de Vida de Suscripciones (Trial, Activa, Gracia, Suspensión, Reactivación)
  // --------------------------------------------------------------------------
  public startTrialSubscription(
    ctx: AuthenticatedTenantContext,
    tenantId: string,
    planCode: string,
    startDateIso: string
  ): TenantSubscriptionRecord {
    if (ctx.roleCode !== 'SUPER_ADMIN') {
      assertTenantAccessAndPermission(ctx, tenantId, 'tenant_subscription', 'MANAGE');
    }

    const plan = this.plans.get(planCode);
    if (!plan || !plan.isActive) {
      throw new Error(`Plan comercial '${planCode}' no existe o está inactivo.`);
    }

    const startMs = Date.parse(startDateIso + 'T00:00:00Z');
    const trialEndIso = new Date(startMs + plan.trialDays * 86_400_000).toISOString().slice(0, 10);

    const sub: TenantSubscriptionRecord = {
      id: `sub-${tenantId}`,
      tenantId,
      planId: plan.id,
      planCode: plan.code,
      status: 'TRIALING',
      billingInterval: 'MONTHLY',
      currentPeriodStart: startDateIso,
      currentPeriodEnd: trialEndIso,
      trialEndsAt: trialEndIso,
      gracePeriodEndsAt: null,
      canceledAt: null,
      billingProvider: 'internal',
    };

    this.subscriptionsByTenant.set(tenantId, sub);
    this.syncEngineEntitlements(ctx, tenantId, sub, plan);
    this.logSubEvent(sub.id, 'TRIAL_STARTED', null, 'TRIALING');
    return sub;
  }

  public activateOrRenewSubscription(
    ctx: AuthenticatedTenantContext,
    tenantId: string,
    planCode: string,
    interval: BillingIntervalType,
    paymentDateIso: string,
    amountPaid: number,
    currencyCode: string,
    providerName: string = 'generic_hmac_gateway'
  ): TenantSubscriptionRecord {
    if (ctx.roleCode !== 'SUPER_ADMIN') {
      assertTenantAccessAndPermission(ctx, tenantId, 'tenant_subscription', 'MANAGE');
    }

    const plan = this.plans.get(planCode);
    if (!plan) throw new Error(`Plan '${planCode}' no encontrado.`);

    const existing = this.subscriptionsByTenant.get(tenantId);
    const prevStatus = existing ? existing.status : null;

    const startMs = Date.parse(paymentDateIso + 'T00:00:00Z');
    const daysToAdd = interval === 'ANNUAL' ? 365 : 30;
    const endIso = new Date(startMs + daysToAdd * 86_400_000).toISOString().slice(0, 10);

    const updated: TenantSubscriptionRecord = {
      id: existing?.id ?? `sub-${tenantId}`,
      tenantId,
      planId: plan.id,
      planCode: plan.code,
      status: 'ACTIVE',
      billingInterval: interval,
      currentPeriodStart: paymentDateIso,
      currentPeriodEnd: endIso,
      trialEndsAt: existing?.trialEndsAt ?? null,
      gracePeriodEndsAt: null,
      canceledAt: null,
      billingProvider: providerName,
    };

    this.subscriptionsByTenant.set(tenantId, updated);
    this.syncEngineEntitlements(ctx, tenantId, updated, plan);
    this.logSubEvent(
      updated.id,
      prevStatus === 'SUSPENDED' ? 'SUBSCRIPTION_REACTIVATED' : 'SUBSCRIPTION_RENEWED',
      prevStatus,
      'ACTIVE',
      amountPaid,
      currencyCode
    );
    return updated;
  }

  public enterGracePeriod(
    ctx: AuthenticatedTenantContext,
    tenantId: string,
    graceDays: number = 5,
    currentDateIso: string
  ): TenantSubscriptionRecord {
    this.assertPlatformAdmin(ctx);
    const sub = this.subscriptionsByTenant.get(tenantId);
    if (!sub) throw new Error('Suscripción no encontrada.');

    const prev = sub.status;
    const endMs = Date.parse(currentDateIso + 'T00:00:00Z') + graceDays * 86_400_000;
    sub.status = 'GRACE_PERIOD';
    sub.gracePeriodEndsAt = new Date(endMs).toISOString().slice(0, 10);

    const plan = this.plans.get(sub.planCode)!;
    this.syncEngineEntitlements(ctx, tenantId, sub, plan);
    this.logSubEvent(sub.id, 'ENTERED_GRACE_PERIOD', prev, 'GRACE_PERIOD');
    return sub;
  }

  /**
   * Suspensión controlada por impago o decisión administrativa.
   * Garantía de negocio (Sección 20): El impago de una suscripción NO borra los datos de la empresa.
   */
  public suspendSubscription(
    ctx: AuthenticatedTenantContext,
    tenantId: string,
    reason: string
  ): TenantSubscriptionRecord {
    this.assertPlatformAdmin(ctx);
    const sub = this.subscriptionsByTenant.get(tenantId);
    if (!sub) throw new Error('Suscripción no encontrada.');

    const prev = sub.status;
    sub.status = 'SUSPENDED';

    const plan = this.plans.get(sub.planCode)!;
    this.syncEngineEntitlements(ctx, tenantId, sub, plan);
    this.logSubEvent(sub.id, `SUBSCRIPTION_SUSPENDED: ${reason}`, prev, 'SUSPENDED');
    return sub;
  }

  public cancelSubscription(
    ctx: AuthenticatedTenantContext,
    tenantId: string,
    canceledAtIso: string
  ): TenantSubscriptionRecord {
    if (ctx.roleCode !== 'SUPER_ADMIN') {
      assertTenantAccessAndPermission(ctx, tenantId, 'tenant_subscription', 'MANAGE');
    }
    const sub = this.subscriptionsByTenant.get(tenantId);
    if (!sub) throw new Error('Suscripción no encontrada.');

    const prev = sub.status;
    sub.status = 'CANCELED';
    sub.canceledAt = canceledAtIso;

    const plan = this.plans.get(sub.planCode)!;
    this.syncEngineEntitlements(ctx, tenantId, sub, plan);
    this.logSubEvent(sub.id, 'SUBSCRIPTION_CANCELED', prev, 'CANCELED');
    return sub;
  }

  // --------------------------------------------------------------------------
  // 3. Procesamiento Seguro e Idempotente de Webhooks de Pago
  // --------------------------------------------------------------------------
  public processBillingWebhook(
    platformSystemCtx: AuthenticatedTenantContext,
    provider: BillingProvider,
    rawBody: string,
    signatureHeader: string,
    webhookSecret: string
  ): { status: 'PROCESSED' | 'DUPLICATE_IGNORED'; eventType: string; tenantId: string } {
    this.assertPlatformAdmin(platformSystemCtx);

    const isValid = provider.verifyWebhookSignature(rawBody, signatureHeader, webhookSecret);
    if (!isValid) {
      throw new AuthorizationError(
        'Firma de webhook de facturación inválida.',
        'INVALID_WEBHOOK_SIGNATURE',
        401
      );
    }

    const event = provider.parseWebhookEvent(rawBody);
    if (!event.externalEventId || !event.tenantId) {
      throw new Error('Payload de webhook incompleto (falta externalEventId o tenantId).');
    }

    // Idempotencia estricta sobre payment_provider_events
    if (this.processedWebhookIds.has(event.externalEventId)) {
      return {
        status: 'DUPLICATE_IGNORED',
        eventType: event.eventType,
        tenantId: event.tenantId,
      };
    }

    const todayIso = new Date().toISOString().slice(0, 10);

    if (event.eventType === 'invoice.paid' || event.eventType === 'subscription.reactivated') {
      const existing = this.subscriptionsByTenant.get(event.tenantId);
      const targetPlan = event.planCode ?? existing?.planCode ?? 'PRO';
      const targetInterval = event.billingInterval ?? existing?.billingInterval ?? 'MONTHLY';
      this.activateOrRenewSubscription(
        platformSystemCtx,
        event.tenantId,
        targetPlan,
        targetInterval,
        todayIso,
        event.amount ?? 0,
        event.currencyCode ?? 'USD',
        provider.providerName
      );
    } else if (event.eventType === 'invoice.payment_failed') {
      this.enterGracePeriod(platformSystemCtx, event.tenantId, 5, todayIso);
    } else if (event.eventType === 'subscription.canceled') {
      this.cancelSubscription(platformSystemCtx, event.tenantId, todayIso);
    }

    this.processedWebhookIds.add(event.externalEventId);

    return {
      status: 'PROCESSED',
      eventType: event.eventType,
      tenantId: event.tenantId,
    };
  }

  public getSubscriptionForTenant(
    ctx: AuthenticatedTenantContext,
    tenantId: string
  ): { subscription: TenantSubscriptionRecord; events: SubscriptionEventLog[] } {
    if (ctx.roleCode !== 'SUPER_ADMIN') {
      assertTenantAccessAndPermission(ctx, tenantId, 'tenant_subscription', 'VIEW');
    }
    const sub = this.subscriptionsByTenant.get(tenantId);
    if (!sub) throw new Error('Suscripción no encontrada.');
    return {
      subscription: sub,
      events: this.subscriptionEvents.filter((e) => e.subscriptionId === sub.id),
    };
  }

  public getPlatformGlobalMetrics(ctx: AuthenticatedTenantContext) {
    this.assertPlatformAdmin(ctx);
    const allSubs = Array.from(this.subscriptionsByTenant.values());
    return {
      totalTenants: allSubs.length,
      activeSubscriptions: allSubs.filter((s) => s.status === 'ACTIVE').length,
      trialingSubscriptions: allSubs.filter((s) => s.status === 'TRIALING').length,
      gracePeriodSubscriptions: allSubs.filter((s) => s.status === 'GRACE_PERIOD').length,
      suspendedSubscriptions: allSubs.filter((s) => s.status === 'SUSPENDED').length,
      canceledSubscriptions: allSubs.filter((s) => s.status === 'CANCELED').length,
    };
  }

  private syncEngineEntitlements(
    ctx: AuthenticatedTenantContext,
    tenantId: string,
    sub: TenantSubscriptionRecord,
    plan: CommercialPlanEntity
  ): void {
    const patch: Partial<PlanEntitlementCheckInput> = {
      subscriptionStatus: sub.status,
      maxUsers: plan.maxUsers,
      maxProducts: plan.maxProducts,
      maxMonthlySales: plan.maxMonthlySales,
      enabledFeatures: new Set(plan.enabledFeatures),
    };
    this.engine.updateSubscriptionState(ctx, tenantId, patch);
  }

  private logSubEvent(
    subscriptionId: string,
    eventType: string,
    previousStatus: string | null,
    newStatus: string,
    amount?: number,
    currencyCode?: string
  ): void {
    this.subscriptionEvents.push({
      id: `subevt-${this.subscriptionEvents.length + 1}`,
      subscriptionId,
      eventType,
      previousStatus,
      newStatus,
      amount,
      currencyCode,
      createdAt: new Date().toISOString(),
    });
  }
}
