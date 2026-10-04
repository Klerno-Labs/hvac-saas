import { createHash } from 'crypto'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { captureException } from '@sentry/nextjs'
import { getStripe } from '@/lib/stripe'
import { isPlatformBillingEvent, verifyStripeWebhook } from '@/lib/stripe-webhook'
import { db } from '@/lib/db'
import { sendDunningEmail } from '@/lib/billing-dunning'
import Stripe from 'stripe'
import type { Organization, Prisma } from '@prisma/client'

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
    if (!subscriptionId) return NextResponse.json({ received: true, ignored: true })
    const snapshot = event.data.object as Stripe.Subscription | Stripe.Invoice
    const customerId = resolveCustomerId(snapshot.customer)
    const metadata = event.type.startsWith('customer.subscription.')
      ? (snapshot as Stripe.Subscription).metadata
      : (snapshot as Stripe.Invoice).subscription_details?.metadata
    // Resolve unique identities in order; a conflicting customer/metadata value
    // must never make an arbitrary OR-query row override an existing binding.
    const organization = await db.organization.findUnique({ where: { stripeSubscriptionId: subscriptionId } })
      ?? (customerId ? await db.organization.findUnique({ where: { stripeCustomerId: customerId } }) : null)
      ?? (metadata?.organizationId ? await db.organization.findUnique({ where: { id: metadata.organizationId } }) : null)
    if (!organization) {
      // The shared Stripe platform also serves other applications. A generic
      // subscription must not cause retries or create FieldClose event records.
      const lineItems = event.type.startsWith('customer.subscription.')
        ? (snapshot as Stripe.Subscription).items?.data : (snapshot as Stripe.Invoice).lines?.data
      const configuredPrices = [process.env.STRIPE_STARTER_PRICE_ID, process.env.STRIPE_PRO_PRICE_ID].filter(Boolean)
      if (lineItems?.some(item => item.price && configuredPrices.includes(item.price.id))) {
        throw new Error('FieldClose subscription organization is not available')
      }
      return NextResponse.json({ received: true, ignored: true })
    }
    if (!customerId || organization.stripeCustomerId !== customerId) throw new Error('Subscription event customer mismatch')
    const currentSubscription = await getStripe().subscriptions.retrieve(subscriptionId, { timeout: 8000, maxNetworkRetries: 0 })
    if (currentSubscription.id !== subscriptionId) throw new Error('Subscription resource mismatch')
    if (!await subscriptionBelongsToOrganization(db, organization, currentSubscription)) {
      return NextResponse.json({ received: true, ignored: true })
    }
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
          await handleSubscriptionChange(tx, currentSubscription, organization)
          break
        case 'invoice.payment_failed':
          {
            const orgId = await handleSubscriptionChange(tx, currentSubscription, organization)
            if (orgId && currentSubscription.status === 'past_due') notification = {orgId, attempt: (event.data.object as Stripe.Invoice).attempt_count}
          }
          break
        case 'invoice.payment_succeeded':
          await handleSubscriptionChange(tx, currentSubscription, organization)
          break
      }
      await tx.webhookEvent.update({where: {stripeEventId: event.id}, data: {processedAt: new Date(), status: 'processed'}})
      return notification
    })
    if (dunning) await sendDunningEmail(dunning.orgId, dunning.attempt).catch(error => {
      captureException(error)
      console.error('[billing-webhook] notification failed', error)
    })
  } catch (error) {
    if ((error as {code?: string}).code === 'P2002') {
      const completed = await db.webhookEvent.findUnique({where: {stripeEventId: event.id}})
      if (completed?.processedAt) return NextResponse.json({received: true})
    }
    captureException(error)
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

type BillingOrganization = Pick<Organization, 'id' | 'stripeCustomerId' | 'stripeSubscriptionId' | 'subscriptionStatus'>

async function subscriptionBelongsToOrganization(client: Pick<Prisma.TransactionClient, 'organization'>, org: BillingOrganization, subscription: Stripe.Subscription): Promise<boolean> {
  const customerId = resolveCustomerId(subscription.customer)
  if (!customerId || org.stripeCustomerId !== customerId) throw new Error('Subscription customer mismatch')
  const configuredPrices = [process.env.STRIPE_STARTER_PRICE_ID, process.env.STRIPE_PRO_PRICE_ID].filter(Boolean)
  const hasFieldClosePrice = subscription.items?.data.some(item => configuredPrices.includes(item.price.id))
  if (subscription.metadata?.organizationId && subscription.metadata.organizationId !== org.id) {
    if (org.stripeSubscriptionId === subscription.id || hasFieldClosePrice ||
        await client.organization.findUnique({ where: { id: subscription.metadata.organizationId }, select: { id: true } })) {
      throw new Error('Subscription organization mismatch')
    }
    return false
  }
  if (org.stripeSubscriptionId === subscription.id) return true
  // A shared customer alone is not ownership proof. Our checkout creates both
  // metadata fields and exactly one configured FieldClose subscription price.
  if (subscription.metadata?.organizationId !== org.id) {
    if (hasFieldClosePrice) throw new Error('FieldClose subscription organization identity is missing')
    return false
  }
  const plan = subscription.metadata.planId?.toLowerCase()
  const priceId = plan === 'starter' ? process.env.STRIPE_STARTER_PRICE_ID : plan === 'pro' ? process.env.STRIPE_PRO_PRICE_ID : undefined
  if (!priceId || subscription.items?.data.length !== 1 || subscription.items.data[0].price.id !== priceId || subscription.items.data[0].quantity !== 1) {
    throw new Error('FieldClose subscription plan could not be verified')
  }
  // Events from a replaced subscription must never change the current one.
  return !org.stripeSubscriptionId || (org.subscriptionStatus === 'CANCELED' && ['active', 'trialing'].includes(subscription.status))
}

async function handleSubscriptionChange(tx: Prisma.TransactionClient, subscription: Stripe.Subscription, snapshot: Organization) {
  await tx.$queryRaw`SELECT id FROM "Organization" WHERE id = ${snapshot.id} FOR UPDATE`
  const org = await tx.organization.findFirst({ where: { id: snapshot.id } })
  if (!org) throw new Error('Subscription organization is not available')
  // The provider read stays outside the lock. If billing changed while it was
  // in flight, roll back the claim and let Stripe retry with fresh state. Check
  // billing fields too because updatedAt has millisecond precision.
  if (org.updatedAt.getTime() !== snapshot.updatedAt.getTime() ||
      org.stripeCustomerId !== snapshot.stripeCustomerId || org.stripeSubscriptionId !== snapshot.stripeSubscriptionId ||
      org.subscriptionStatus !== snapshot.subscriptionStatus || org.plan !== snapshot.plan ||
      org.readOnlyAt?.getTime() !== snapshot.readOnlyAt?.getTime() ||
      org.trialEndsAt?.getTime() !== snapshot.trialEndsAt?.getTime() ||
      org.currentPeriodEnd?.getTime() !== snapshot.currentPeriodEnd?.getTime()) {
    throw new Error('Subscription state changed during provider verification; retry required')
  }
  if (!await subscriptionBelongsToOrganization(tx, org, subscription)) return
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
