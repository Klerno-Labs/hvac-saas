import { createHash } from 'crypto'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { getStripe } from '@/lib/stripe'
import { isPlatformBillingEvent, verifyStripeWebhook } from '@/lib/stripe-webhook'
import { db } from '@/lib/db'
import { sendDunningEmail } from '@/lib/billing-dunning'
import Stripe from 'stripe'
import type { Prisma } from '@prisma/client'

// This route is intentionally unauthenticated — Stripe signs every request with
// STRIPE_WEBHOOK_SECRET and we verify that signature before touching the database.
export async function POST(req: Request) {
  const body = await req.text()
  const headersList = await headers()
  const signature = headersList.get('stripe-signature')

  const verification = verifyStripeWebhook(body, signature, ['platform'])
  if (!verification.verified) return NextResponse.json({ error: verification.error }, { status: verification.status })
  const { event } = verification
  if (!verification.modeMatches || !isPlatformBillingEvent(event.type)) {
    return NextResponse.json({ received: true, ignored: true })
  }

  try {
    // Stripe does not guarantee delivery order. Reconcile the current resource,
    // rather than letting a delayed invoice event reactivate a canceled account.
    let subscriptionId: string | undefined
    if (event.type.startsWith('customer.subscription.')) {
      subscriptionId = (event.data.object as Stripe.Subscription).id
    } else if (event.type === 'invoice.payment_failed' || event.type === 'invoice.payment_succeeded') {
      const reference = (event.data.object as Stripe.Invoice).subscription
      subscriptionId = typeof reference === 'string' ? reference : reference?.id
    }
    const currentSubscription = subscriptionId ? await getStripe().subscriptions.retrieve(subscriptionId) : null
    // Claim and state changes commit together. Failure rolls back the claim so
    // Stripe can safely retry. The unique key serializes duplicate deliveries.
    const dunning = await db.$transaction(async tx => {
      await tx.webhookEvent.deleteMany({where: {stripeEventId: event.id, processedAt: null}})
      await tx.webhookEvent.create({data: {stripeEventId: event.id, type: event.type,
        payloadHash: createHash('sha256').update(body).digest('hex')}})
      let notification: {orgId: string; attempt: number} | null = null
      switch (event.type) {
        case 'customer.subscription.created':
        case 'customer.subscription.updated':
        case 'customer.subscription.deleted':
          if (currentSubscription) await handleSubscriptionChange(tx, currentSubscription)
          break
        case 'invoice.payment_failed':
          if (currentSubscription) {
            const orgId = await handleSubscriptionChange(tx, currentSubscription)
            if (orgId && currentSubscription.status === 'past_due') notification = {orgId, attempt: (event.data.object as Stripe.Invoice).attempt_count}
          }
          break
        case 'invoice.payment_succeeded':
          if (currentSubscription) await handleSubscriptionChange(tx, currentSubscription)
          break
      }
      await tx.webhookEvent.update({where: {stripeEventId: event.id}, data: {processedAt: new Date(), status: 'processed'}})
      return notification
    })
    if (dunning) await sendDunningEmail(dunning.orgId, dunning.attempt).catch(error => console.error('[billing-webhook] notification failed', error))
  } catch (error) {
    if ((error as {code?: string}).code === 'P2002') {
      const completed = await db.webhookEvent.findUnique({where: {stripeEventId: event.id}})
      if (completed?.processedAt) return NextResponse.json({received: true})
    }
    console.error(`[billing-webhook] processing failed (${event.id})`, error)
    return NextResponse.json({error: 'Webhook processing failed'}, {status: 500})
  }
  return NextResponse.json({received: true})
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

async function handleSubscriptionChange(tx: Prisma.TransactionClient, subscription: Stripe.Subscription) {
  const customerId = resolveCustomerId(subscription.customer)
  if (!customerId) return

  const org = await tx.organization.findFirst({ where: { stripeCustomerId: customerId } })
  if (!org) throw new Error('Subscription customer is not linked to an organization')
  if (subscription.metadata?.organizationId && subscription.metadata.organizationId !== org.id) throw new Error('Subscription organization mismatch')
  // Events from a replaced subscription must never change the current one.
  if (org.stripeSubscriptionId && org.stripeSubscriptionId !== subscription.id) {
    const replacement = org.subscriptionStatus === 'CANCELED' &&
      subscription.metadata?.organizationId === org.id &&
      (subscription.status === 'active' || subscription.status === 'trialing')
    if (!replacement) return
  }
  const plan = subscription.metadata?.planId?.toUpperCase()

  const newStatus = STATUS_MAP[subscription.status] ?? 'INCOMPLETE'
  const shouldFreeze = newStatus === 'UNPAID' || newStatus === 'CANCELED'
  const shouldUnfreeze = newStatus === 'ACTIVE' || newStatus === 'TRIALING'

  await tx.organization.update({
    where: { id: org.id },
    data: {
      subscriptionStatus: newStatus,
      stripeSubscriptionId: subscription.id,
      ...(plan === 'STARTER' || plan === 'PRO' ? {plan} : {}),
      trialEndsAt: subscription.trial_end ? new Date(subscription.trial_end * 1000) : null,
      currentPeriodEnd: subscription.current_period_end
        ? new Date(subscription.current_period_end * 1000)
        : null,
      ...(shouldFreeze ? { readOnlyAt: new Date() } : {}),
      ...(shouldUnfreeze ? { readOnlyAt: null } : {}),
    },
  })
  return org.id
}
