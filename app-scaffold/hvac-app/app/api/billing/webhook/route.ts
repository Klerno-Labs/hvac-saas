import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { getStripe } from '@/lib/stripe'
import { db } from '@/lib/db'
import { sendDunningEmail } from '@/lib/billing-dunning'
import Stripe from 'stripe'

// This route is intentionally unauthenticated — Stripe signs every request with
// STRIPE_WEBHOOK_SECRET and we verify that signature before touching the database.
export async function POST(req: Request) {
  const body = await req.text()
  const headersList = await headers()
  const signature = headersList.get('stripe-signature')

  if (!signature || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Missing webhook configuration' }, { status: 400 })
  }

  let event: Stripe.Event

  try {
    event = getStripe().webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET)
  } catch {
    return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 400 })
  }

  // Idempotency: atomically claim the event before processing.
  // A unique-constraint violation (P2002) means Stripe already delivered this event
  // and we processed it — return 200 so Stripe stops retrying.
  try {
    await db.webhookEvent.create({
      data: { stripeEventId: event.id, type: event.type },
    })
  } catch (e) {
    if ((e as { code?: string }).code === 'P2002') {
      return NextResponse.json({ received: true })
    }
    throw e
  }

  try {
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await handleSubscriptionChange(
          event.data.object as Stripe.Subscription,
          event.type === 'customer.subscription.deleted',
        )
        break

      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice)
        break

      case 'invoice.payment_succeeded':
        await handleInvoicePaymentSucceeded(event.data.object as Stripe.Invoice)
        break
    }

    await db.webhookEvent.update({
      where: { stripeEventId: event.id },
      data: { processedAt: new Date() },
    })
  } catch (error) {
    // Log but return 200 — the event is recorded so Stripe won't retry into an infinite loop.
    // Operators can audit WebhookEvent rows where processedAt IS NULL.
    console.error(`[billing-webhook] error processing ${event.type} (${event.id}):`, error)
  }

  return NextResponse.json({ received: true })
}

const STATUS_MAP: Record<string, 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'CANCELED' | 'UNPAID' | 'INCOMPLETE'> = {
  active: 'ACTIVE',
  trialing: 'TRIALING',
  past_due: 'PAST_DUE',
  canceled: 'CANCELED',
  unpaid: 'UNPAID',
  incomplete: 'INCOMPLETE',
  incomplete_expired: 'INCOMPLETE',
}

function resolveCustomerId(
  customer: string | Stripe.Customer | Stripe.DeletedCustomer | null | undefined,
): string | null {
  if (!customer) return null
  if (typeof customer === 'string') return customer
  return customer.id
}

async function handleSubscriptionChange(subscription: Stripe.Subscription, isDeleted: boolean) {
  const customerId = resolveCustomerId(subscription.customer)
  if (!customerId) return

  const org = await db.organization.findFirst({ where: { stripeCustomerId: customerId } })
  if (!org) return

  const newStatus = isDeleted ? 'CANCELED' : (STATUS_MAP[subscription.status] ?? 'ACTIVE')
  const shouldFreeze = newStatus === 'UNPAID' || newStatus === 'CANCELED'
  const shouldUnfreeze = newStatus === 'ACTIVE' || newStatus === 'TRIALING'

  await db.organization.update({
    where: { id: org.id },
    data: {
      subscriptionStatus: newStatus,
      stripeSubscriptionId: subscription.id,
      currentPeriodEnd: subscription.current_period_end
        ? new Date(subscription.current_period_end * 1000)
        : null,
      ...(shouldFreeze ? { readOnlyAt: new Date() } : {}),
      ...(shouldUnfreeze ? { readOnlyAt: null } : {}),
    },
  })
}

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  const customerId = resolveCustomerId(invoice.customer)
  if (!customerId) return

  const org = await db.organization.findFirst({ where: { stripeCustomerId: customerId } })
  if (!org) return

  await db.organization.update({
    where: { id: org.id },
    data: { subscriptionStatus: 'PAST_DUE' },
  })

  await sendDunningEmail(org.id, invoice.attempt_count)
}

async function handleInvoicePaymentSucceeded(invoice: Stripe.Invoice) {
  const customerId = resolveCustomerId(invoice.customer)
  if (!customerId) return

  const org = await db.organization.findFirst({ where: { stripeCustomerId: customerId } })
  if (!org) return

  await db.organization.update({
    where: { id: org.id },
    data: { subscriptionStatus: 'ACTIVE', readOnlyAt: null },
  })
}
