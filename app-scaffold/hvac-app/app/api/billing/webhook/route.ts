import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import Stripe from 'stripe'
import { getStripe } from '@/lib/stripe'
import { db } from '@/lib/db'
import { trackEvent } from '@/lib/events'
import { sendDunningEmail, clearDunningState } from '@/lib/dunning'
import type { Plan, SubscriptionStatus } from '@prisma/client'

/**
 * Billing webhook for the platform subscription (what the shop pays US).
 *
 * Distinct from /api/stripe/webhook, which owns customer-facing payments
 * (checkout, payment_intent, Connect account.updated). This endpoint handles
 * subscription lifecycle + platform-invoice dunning. Both can safely receive
 * the same Stripe event because idempotency is keyed on `stripeEventId` in the
 * append-only WebhookEvent table — whichever endpoint processes first wins and
 * the other no-ops (CLAUDE.md: idempotent writes, never double-apply).
 *
 * Security: the webhook is unauthenticated but signature-verified. Org is
 * ALWAYS resolved by Stripe IDs (stripeCustomerId / stripeSubscriptionId) —
 * never from a payload orgId or metadata alone.
 */

const SUBSCRIPTION_STATUS_MAP: Record<Stripe.Subscription.Status, SubscriptionStatus> = {
  active: 'ACTIVE',
  trialing: 'TRIALING',
  past_due: 'PAST_DUE',
  canceled: 'CANCELED',
  unpaid: 'UNPAID',
  incomplete: 'INCOMPLETE',
  incomplete_expired: 'CANCELED',
  paused: 'ACTIVE',
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: unknown }).code === 'P2002'
  )
}

function customerIdOf(c: string | Stripe.Customer | Stripe.DeletedCustomer | null | undefined): string | null {
  if (!c || typeof c !== 'string') return typeof c === 'object' && c && 'id' in c ? c.id : null
  return c
}

function subscriptionIdOf(s: string | Stripe.Subscription | { id: string } | null | undefined): string | null {
  if (!s) return null
  if (typeof s === 'string') return s
  if ('id' in s) return s.id
  return null
}

export async function POST(req: NextRequest) {
  // Lazy env read at request time — never at import time, never logged.
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  const signature = req.headers.get('stripe-signature')

  if (!signature || !secret) {
    return NextResponse.json({ error: 'Missing signature configuration' }, { status: 400 })
  }

  // Raw body — must NOT be parsed as JSON before verification.
  const rawBody = await req.text()

  let event: Stripe.Event
  try {
    event = getStripe().webhooks.constructEvent(rawBody, signature, secret)
  } catch (err) {
    console.error('[billing-webhook] signature verification failed', err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  // Idempotency: append-only row keyed by stripeEventId. If it already exists,
  // the event was already received — return 200 WITHOUT reprocessing. This is
  // the authoritative "have we handled this" check and is safe under
  // concurrent/redelivered events. (Mirrors the HMAC+idempotency discipline in
  // robert-client.ts and CLAUDE.md's idempotent-writes rule.)
  try {
    await db.webhookEvent.create({
      data: { stripeEventId: event.id, type: event.type },
    })
  } catch (err) {
    if (isUniqueViolation(err)) {
      return NextResponse.json({ received: true, duplicate: true })
    }
    console.error('[billing-webhook] idempotency store unavailable', err)
    // Storage failure: 500 so Stripe retries the whole delivery.
    return NextResponse.json({ error: 'Idempotency store unavailable' }, { status: 500 })
  }

  try {
    await dispatch(event)
    await db.webhookEvent.update({
      where: { stripeEventId: event.id },
      data: { processedAt: new Date() },
    })
    return NextResponse.json({ received: true })
  } catch (err) {
    console.error(`[billing-webhook] processing error for ${event.type} (${event.id})`, err)
    // 500 lets Stripe retry for transient (e.g. DB) errors. The idempotency
    // marker is intentionally left in place: a retry redelivering the SAME
    // event.id will short-circuit to 200 (duplicate) — guaranteeing at-most-once
    // application and preventing infinite retry loops on permanent failures.
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 })
  }
}

async function dispatch(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      await handleSubscriptionChange(event.data.object as Stripe.Subscription)
      return
    case 'invoice.payment_failed':
      await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice)
      return
    case 'invoice.payment_succeeded':
      await handleInvoicePaymentSucceeded(event.data.object as Stripe.Invoice)
      return
    default:
      // Not a billing event owned here; ignore silently.
      return
  }
}

async function resolveOrgByStripeIds(params: {
  customerId?: string | null
  subscriptionId?: string | null
}) {
  const or: ({ stripeCustomerId: string } | { stripeSubscriptionId: string })[] = []
  if (params.customerId) or.push({ stripeCustomerId: params.customerId })
  if (params.subscriptionId) or.push({ stripeSubscriptionId: params.subscriptionId })
  if (or.length === 0) return null
  return db.organization.findFirst({
    where: { OR: or },
    select: { id: true, plan: true, subscriptionStatus: true, readOnlyAt: true },
  })
}

async function handleSubscriptionChange(subscription: Stripe.Subscription): Promise<void> {
  const customerId = customerIdOf(subscription.customer)
  const org = await resolveOrgByStripeIds({ customerId, subscriptionId: subscription.id })
  if (!org) {
    console.warn(
      `[billing-webhook] subscription ${subscription.id}: no org for customer=${customerId}`,
    )
    return
  }

  const newStatus: SubscriptionStatus = SUBSCRIPTION_STATUS_MAP[subscription.status] ?? 'INCOMPLETE'
  const planId: Plan = (subscription.metadata?.planId as Plan | undefined) ?? org.plan
  const now = new Date()

  // readOnlyAt freeze/unfreeze. `undefined` means "leave the column untouched".
  // - active/trialing  -> unfreeze (clear readOnlyAt)
  // - unpaid/canceled  -> freeze (readOnlyAt = now)
  // - past_due         -> grace: do NOT freeze here. Stripe escalates to
  //   unpaid/canceled after Smart Retries are exhausted, which then freezes.
  //   Freezing immediately on the first past_due would lock paying shops out
  //   mid-retry. The grace window is owned by Stripe's retry config, not us.
  // - incomplete       -> leave as-is (checkout not yet finalized).
  let readOnlyAt: Date | null | undefined = undefined
  if (newStatus === 'ACTIVE' || newStatus === 'TRIALING') readOnlyAt = null
  else if (newStatus === 'UNPAID' || newStatus === 'CANCELED') readOnlyAt = now

  await db.organization.update({
    where: { id: org.id },
    data: {
      subscriptionStatus: newStatus,
      plan: planId,
      stripeSubscriptionId: subscription.id,
      currentPeriodEnd: subscription.current_period_end
        ? new Date(subscription.current_period_end * 1000)
        : null,
      ...(readOnlyAt !== undefined ? { readOnlyAt } : {}),
    },
  })

  await trackEvent({
    organizationId: org.id,
    eventName: 'subscription_updated',
    entityType: 'organization',
    entityId: org.id,
    metadataJson: {
      status: newStatus,
      plan: planId,
      readOnlyAt: readOnlyAt === undefined ? 'unchanged' : readOnlyAt ? 'frozen' : 'cleared',
    },
  })
}

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
  const customerId = customerIdOf(invoice.customer)
  const subscriptionId = subscriptionIdOf(invoice.subscription)
  const org = await resolveOrgByStripeIds({ customerId, subscriptionId })
  if (!org) {
    console.warn(`[billing-webhook] invoice.payment_failed ${invoice.id}: no org`)
    return
  }

  await db.organization.update({
    where: { id: org.id },
    data: { subscriptionStatus: 'PAST_DUE' },
  })

  // Dunning is idempotent per-invoice (gated by dunningLastSentInvoiceId), so a
  // retried webhook never double-sends. Degrade-and-alert: a missing email
  // provider key makes sendDunningEmail a no-op-with-log, never a crash.
  await sendDunningEmail({ orgId: org.id, invoiceId: invoice.id })

  await trackEvent({
    organizationId: org.id,
    eventName: 'subscription_payment_failed',
    entityType: 'organization',
    entityId: org.id,
    metadataJson: { invoiceId: invoice.id },
  })
}

async function handleInvoicePaymentSucceeded(invoice: Stripe.Invoice): Promise<void> {
  const customerId = customerIdOf(invoice.customer)
  const subscriptionId = subscriptionIdOf(invoice.subscription)
  const org = await resolveOrgByStripeIds({ customerId, subscriptionId })
  if (!org) {
    console.warn(`[billing-webhook] invoice.payment_succeeded ${invoice.id}: no org`)
    return
  }

  // Unfreeze + clear dunning state. A recovered payment restores full access.
  await db.organization.update({
    where: { id: org.id },
    data: { subscriptionStatus: 'ACTIVE', readOnlyAt: null },
  })
  await clearDunningState(org.id)

  await trackEvent({
    organizationId: org.id,
    eventName: 'subscription_payment_succeeded',
    entityType: 'organization',
    entityId: org.id,
    metadataJson: { invoiceId: invoice.id },
  })
}
