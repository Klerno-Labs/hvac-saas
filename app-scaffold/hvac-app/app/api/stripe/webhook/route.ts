import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { captureException } from '@sentry/nextjs'
import { isPlatformBillingEvent, verifyStripeWebhook } from '@/lib/stripe-webhook'
import { db } from '@/lib/db'
import { trackEvent } from '@/lib/events'
import { logAudit } from '@/lib/audit'
import { reconcileConfirmedPayment } from '@/lib/payment-reconciliation'
import { POST as billingWebhook } from '@/app/api/billing/webhook/route'
import { TERMINAL_PAYMENT_METHOD } from '@/lib/terminal'
import Stripe from 'stripe'

export async function POST(req: Request) {
  const billingRequest = req.clone()
  const body = await req.text()
  const headersList = await headers()
  const signature = headersList.get('stripe-signature')

  const verification = verifyStripeWebhook(body, signature, ['platform', 'connect'])
  if (!verification.verified) return NextResponse.json({ error: verification.error }, { status: verification.status })
  const { event, scope } = verification
  if (!verification.modeMatches) return NextResponse.json({ received: true, ignored: true })
  if (scope === 'platform') {
    // Preserve the original platform endpoint URL without allowing connected
    // account subscription events to change this platform's subscriptions.
    if (isPlatformBillingEvent(event.type)) return billingWebhook(billingRequest)
    return NextResponse.json({ received: true, ignored: true })
  }

  try {
    if (!await belongsToFieldClose(event)) return NextResponse.json({ received: true, ignored: true })
    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded':
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session, event.account, event.livemode)
        break

      case 'checkout.session.expired':
        await handleCheckoutExpired(event.data.object as Stripe.Checkout.Session, event.account!)
        break

      case 'payment_intent.payment_failed':
        await handlePaymentFailed(event.data.object as Stripe.PaymentIntent, event.account!)
        break

      case 'payment_intent.succeeded':
        await handlePaymentIntentSucceeded(event.data.object as Stripe.PaymentIntent, event.account, event.livemode)
        break

      case 'account.updated':
        await handleAccountUpdated(event.data.object as Stripe.Account, event.account!)
        break

      default:
        return NextResponse.json({ received: true, ignored: true })
    }

    await trackEvent({
      eventName: 'webhook_processed',
      metadataJson: { eventType: event.type, eventId: event.id },
    })

    return NextResponse.json({ received: true })
  } catch (error) {
    captureException(error)
    console.error(`Webhook processing error for ${event.type}:`, error)
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
  }
}

/** Shared Connect destinations receive other products' events as well. Only
 * local account/document references enter handlers; those handlers still reject
 * wrong account/org identities and retry failures for our own records. */
async function belongsToFieldClose(event: Stripe.Event): Promise<boolean> {
  if (event.type === 'account.updated') {
    const account = event.data.object as Stripe.Account
    if (account.id !== event.account) throw new Error('Stripe account update scope mismatch')
    return Boolean(await db.organization.findFirst({ where: { stripeConnectedAccountId: account.id }, select: { id: true } }))
  }
  const checkoutEvent = ['checkout.session.completed', 'checkout.session.async_payment_succeeded', 'checkout.session.expired'].includes(event.type)
  if (!checkoutEvent && !['payment_intent.succeeded', 'payment_intent.payment_failed'].includes(event.type)) return false
  const object = event.data.object as Stripe.Checkout.Session | Stripe.PaymentIntent
  if (checkoutEvent && (object as Stripe.Checkout.Session).mode !== 'payment') return false
  if (checkoutEvent && event.type !== 'checkout.session.expired' && (object as Stripe.Checkout.Session).payment_status !== 'paid') return false
  if (event.type === 'payment_intent.succeeded' && object.metadata?.method !== TERMINAL_PAYMENT_METHOD) {
    const saved = await db.payment.findUnique({ where: { stripePaymentIntent: object.id }, select: { method: true } })
    if (saved?.method === TERMINAL_PAYMENT_METHOD) throw new Error('Missing Terminal payment method identity')
    return false
  }
  if (object.metadata?.invoiceId && await db.invoice.findUnique({ where: { id: object.metadata.invoiceId }, select: { id: true } })) return true
  if (object.metadata?.organizationId && await db.organization.findFirst({ where: { id: object.metadata.organizationId }, select: { id: true } })) return true
  // Missing metadata on a previously saved FieldClose session/intent is a
  // processing error, not a foreign event that can be discarded silently.
  if (checkoutEvent && await db.invoice.findFirst({ where: { stripeCheckoutSessionId: object.id }, select: { id: true } })) return true
  const reference = checkoutEvent ? (object as Stripe.Checkout.Session).payment_intent : object.id
  const intentId = typeof reference === 'string' ? reference : reference?.id
  return Boolean(intentId && await db.payment.findUnique({ where: { stripePaymentIntent: intentId }, select: { id: true } }))
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session, account: string | undefined, livemode: boolean) {
  // ACH and other delayed methods can complete checkout before settling.
  if (session.mode !== 'payment' || session.payment_status !== 'paid') return
  const invoiceId = session.metadata?.invoiceId
  const organizationId = session.metadata?.organizationId
  const paymentIntentId = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id
  if (!invoiceId || !organizationId || !paymentIntentId) throw new Error('Missing payment identity')
  await reconcileConfirmedPayment({invoiceId, organizationId, connectedAccountId: account,
    paymentIntentId, amountCents: session.amount_total ?? 0, currency: session.currency ?? '', method: 'checkout', livemode})
}

async function handleCheckoutExpired(session: Stripe.Checkout.Session, account: string) {
  if (session.mode !== 'payment') return
  const paymentIntentId = typeof session.payment_intent === 'string'
    ? session.payment_intent
    : session.payment_intent?.id
  await recordPaymentFailure({
    invoiceId: session.metadata?.invoiceId,
    organizationId: session.metadata?.organizationId,
    account,
    paymentIntentId,
    sessionId: session.id,
    reason: 'checkout_expired',
  })
}

async function handleAccountUpdated(account: Stripe.Account, connectedAccountId: string) {
  if (account.id !== connectedAccountId) throw new Error('Stripe account update scope mismatch')

  const org = await db.organization.findFirst({
    where: { stripeConnectedAccountId: account.id },
  })
  if (!org) return

  const chargesEnabled = account.charges_enabled ?? false
  const payoutsEnabled = account.payouts_enabled ?? false

  await db.organization.update({
    where: { id: org.id },
    data: { stripeChargesEnabled: chargesEnabled, stripePayoutsEnabled: payoutsEnabled },
  })

  if (chargesEnabled && !org.stripeChargesEnabled) {
    await trackEvent({
      organizationId: org.id,
      eventName: 'stripe_connect_completed',
      entityType: 'organization',
      entityId: org.id,
    })
  }
}

async function handlePaymentFailed(paymentIntent: Stripe.PaymentIntent, account: string) {
  await recordPaymentFailure({
    invoiceId: paymentIntent.metadata?.invoiceId,
    organizationId: paymentIntent.metadata?.organizationId,
    account,
    paymentIntentId: paymentIntent.id,
    reason: 'payment_intent_failed',
  })
}

async function recordPaymentFailure(input: {
  invoiceId?: string
  organizationId?: string
  account: string
  paymentIntentId?: string
  sessionId?: string
  reason: 'checkout_expired' | 'payment_intent_failed'
}) {
  const { invoiceId, organizationId, account, paymentIntentId, sessionId, reason } = input
  if (!invoiceId) throw new Error('Missing failed payment invoice')
  if (!organizationId) throw new Error('Missing failed payment organization')
  await db.$transaction(async tx => {
    // Use the same invoice lock as settlement so late failures cannot overwrite
    // a successful payment, and validate every identity before changing records.
    await tx.$queryRaw`SELECT id FROM "Invoice" WHERE id = ${invoiceId} FOR UPDATE`
    const invoice = await tx.invoice.findUnique({ where: { id: invoiceId }, include: { organization: true } })
    if (!invoice || invoice.organizationId !== organizationId || invoice.organization.stripeConnectedAccountId !== account) {
      throw new Error('Failed payment does not match invoice organization and Stripe account')
    }
    if (invoice.status === 'paid' || invoice.status === 'void' || invoice.status === 'draft') return
    const payment = paymentIntentId
      ? await tx.payment.findUnique({ where: { stripePaymentIntent: paymentIntentId } })
      : null
    if (payment && (payment.invoiceId !== invoiceId || payment.organizationId !== organizationId)) {
      throw new Error('Failed payment intent is linked to another invoice')
    }
    const cleared = sessionId ? await tx.invoice.updateMany({
      where: { id: invoiceId, organizationId, stripeCheckoutSessionId: sessionId, status: { not: 'paid' } },
      data: { stripeCheckoutSessionId: null },
    }) : { count: 0 }
    const failed = payment ? await tx.payment.updateMany({
      where: { id: payment.id, invoiceId, organizationId, status: 'pending' },
      data: { status: 'failed' },
    }) : { count: 0 }
    if (failed.count) {
      await logAudit({
        organizationId, actorEmail: 'stripe-webhook', eventType: 'payment.failed',
        targetType: 'invoice', targetId: invoiceId,
        metadata: { amountCents: payment!.amountCents, currency: payment!.currency, status: 'failed', invoiceId },
      }, tx)
    }
    if (cleared.count || failed.count) {
      await trackEvent({
        organizationId, eventName: 'invoice_payment_failed', entityType: 'invoice', entityId: invoiceId,
        metadataJson: { reason, ...(sessionId ? { sessionId } : {}), ...(paymentIntentId ? { paymentIntentId } : {}) },
      }, tx)
    }
  })
}

async function handlePaymentIntentSucceeded(paymentIntent: Stripe.PaymentIntent, account: string | undefined, livemode: boolean) {
  if (paymentIntent.metadata?.method !== TERMINAL_PAYMENT_METHOD) return
  if (paymentIntent.status !== 'succeeded') return
  const {invoiceId, organizationId} = paymentIntent.metadata
  if (!invoiceId || !organizationId) throw new Error('Missing Terminal payment identity')
  await reconcileConfirmedPayment({invoiceId, organizationId, connectedAccountId: account,
    paymentIntentId: paymentIntent.id, amountCents: paymentIntent.amount_received,
    currency: paymentIntent.currency, method: TERMINAL_PAYMENT_METHOD, livemode})
}
