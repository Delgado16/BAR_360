// ============================================================================
// MI NEGOCIO PRO 360 — ROUTE HANDLER DE WEBHOOKS DE SUSCRIPCIONES SaaS
// Valida firma HMAC, garantiza idempotencia en PostgreSQL y registra eventos.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/infrastructure/database/prisma-client';
import { HmacWebhookBillingProvider } from '@/infrastructure/billing/billing-provider';

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    const signature = request.headers.get('x-billing-signature') ?? '';
    const secret = process.env.BILLING_WEBHOOK_SECRET ?? '';

    if (!secret) {
      return NextResponse.json(
        { error: 'BILLING_WEBHOOK_SECRET no configurado en el servidor.' },
        { status: 500 },
      );
    }

    const provider = new HmacWebhookBillingProvider('production_gateway');
    const isValid = provider.verifyWebhookSignature(rawBody, signature, secret);
    if (!isValid) {
      return NextResponse.json({ error: 'Firma de webhook inválida.' }, { status: 401 });
    }

    const event = provider.parseWebhookEvent(rawBody);
    const existing = await prisma.paymentProviderEvent.findUnique({
      where: { externalEventId: event.externalEventId },
    });

    if (existing) {
      return NextResponse.json(
        {
          received: true,
          idempotentReplay: true,
          externalEventId: event.externalEventId,
          eventType: event.eventType,
          tenantId: event.tenantId,
        },
        { status: 200 },
      );
    }

    await prisma.paymentProviderEvent.create({
      data: {
        provider: 'production_gateway',
        externalEventId: event.externalEventId,
        eventType: event.eventType,
        payloadJson: event as unknown as object,
        signatureValid: true,
        processedAt: new Date(),
      },
    });

    return NextResponse.json(
      {
        received: true,
        idempotentReplay: false,
        externalEventId: event.externalEventId,
        eventType: event.eventType,
        tenantId: event.tenantId,
      },
      { status: 200 },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error procesando webhook.' },
      { status: 400 },
    );
  }
}
