// ============================================================================
// MI NEGOCIO PRO 360 — ABSTRACCIÓN BillingProvider Y VERIFICACIÓN DE WEBHOOKS
// Diseñada para no atarse a un único proveedor de pagos por país (Sección 20).
// ============================================================================

import crypto from 'node:crypto';

export type BillingIntervalType = 'MONTHLY' | 'ANNUAL';

export interface CreateCheckoutInput {
  tenantId: string;
  tenantEmail: string;
  planCode: string;
  billingInterval: BillingIntervalType;
  amount: number;
  currencyCode: string;
  successUrl: string;
  cancelUrl: string;
}

export interface CheckoutSessionResult {
  provider: string;
  externalSessionId: string;
  checkoutUrl: string;
}

export interface NormalizedBillingWebhookEvent {
  externalEventId: string;
  eventType:
    | 'invoice.paid'
    | 'invoice.payment_failed'
    | 'subscription.canceled'
    | 'subscription.reactivated';
  tenantId: string;
  planCode?: string;
  billingInterval?: BillingIntervalType;
  amount?: number;
  currencyCode?: string;
  externalSubId?: string;
  rawPayload: Record<string, unknown>;
}

export interface BillingProvider {
  readonly providerName: string;
  createCheckoutSession(input: CreateCheckoutInput): Promise<CheckoutSessionResult>;
  verifyWebhookSignature(rawBody: string, signatureHeader: string, secret: string): boolean;
  parseWebhookEvent(rawBody: string): NormalizedBillingWebhookEvent;
}

/**
 * Proveedor estándar basado en firma HMAC-SHA256 (compatible con pasarelas regionales
 * o webhooks internos/manuales de facturación SaaS).
 */
export class HmacWebhookBillingProvider implements BillingProvider {
  public readonly providerName: string;

  constructor(providerName: string = 'generic_hmac_gateway') {
    this.providerName = providerName;
  }

  public async createCheckoutSession(input: CreateCheckoutInput): Promise<CheckoutSessionResult> {
    const externalSessionId = `chk_${input.tenantId.slice(0, 8)}_${Date.now()}`;
    return {
      provider: this.providerName,
      externalSessionId,
      checkoutUrl: `${input.successUrl}?session_id=${externalSessionId}&plan=${input.planCode}`,
    };
  }

  public verifyWebhookSignature(rawBody: string, signatureHeader: string, secret: string): boolean {
    if (!rawBody || !signatureHeader || !secret) return false;
    const expectedHex = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
    const providedHex = signatureHeader.replace(/^sha256=/i, '').trim();
    if (expectedHex.length !== providedHex.length) return false;
    return crypto.timingSafeEqual(Buffer.from(expectedHex, 'hex'), Buffer.from(providedHex, 'hex'));
  }

  public parseWebhookEvent(rawBody: string): NormalizedBillingWebhookEvent {
    const parsed = JSON.parse(rawBody) as Record<string, unknown>;
    return {
      externalEventId: String(parsed.externalEventId ?? ''),
      eventType: parsed.eventType as NormalizedBillingWebhookEvent['eventType'],
      tenantId: String(parsed.tenantId ?? ''),
      planCode: parsed.planCode ? String(parsed.planCode) : undefined,
      billingInterval: parsed.billingInterval as BillingIntervalType | undefined,
      amount: parsed.amount !== undefined ? Number(parsed.amount) : undefined,
      currencyCode: parsed.currencyCode ? String(parsed.currencyCode) : undefined,
      externalSubId: parsed.externalSubId ? String(parsed.externalSubId) : undefined,
      rawPayload: parsed,
    };
  }
}

export function signWebhookPayloadForTest(rawBody: string, secret: string): string {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
}
