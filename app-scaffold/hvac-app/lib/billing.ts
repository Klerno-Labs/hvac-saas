import { getStripe } from '@/lib/stripe'
import { db } from '@/lib/db'
import { redirect } from 'next/navigation'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import type Stripe from 'stripe'
import { billingPortalConfigurationId } from '@/lib/billing-portal'
import { supportEmail } from '@/lib/support'

export const PLANS = {
  starter: {
    name: 'Starter',
    priceMonthly: 4900, // $49/month in cents
    stripePriceId: process.env.STRIPE_STARTER_PRICE_ID || '',
    features: ['Unlimited customers', 'Unlimited jobs', 'AI estimate drafting', 'Invoice & payment collection', 'Customer portal'],
  },
  pro: {
    name: 'Pro',
    priceMonthly: 9900, // $99/month in cents
    stripePriceId: process.env.STRIPE_PRO_PRICE_ID || '',
    features: ['Everything in Starter', 'Collections automation', 'Team members'],
  },
} as const

export type PlanId = keyof typeof PLANS

const CHECKOUT_EVENT = 'subscription_checkout_attempt'
const CHECKOUT_LEASE_MS = 5 * 60 * 1000
// Stripe guarantees idempotency retention for at least 24 hours. Leave a margin;
// an older uncertain attempt requires provider reconciliation, never a blind retry.
const CHECKOUT_RETRY_MS = 23 * 60 * 60 * 1000
const stripeRequest = { timeout: 8000, maxNetworkRetries: 0 } as const
const attemptSchema = z.object({
  active: z.boolean(), leaseToken: z.string(), leaseUntil: z.number(),
  planId: z.enum(['starter', 'pro']), priceId: z.string().min(1), appUrl: z.string().url(),
  email: z.string().email(), customerId: z.string().nullable(), sessionId: z.string().nullable(),
})
type AttemptMetadata = z.infer<typeof attemptSchema>
type CheckoutAttempt = { id: string; createdAt: Date; metadata: AttemptMetadata }
type CheckoutInput = { organizationId: string; planId: PlanId; userEmail: string }
const pendingCheckout = { error: 'A subscription checkout is being confirmed. Please wait before trying again.' }
const referenceId = (reference: string | { id: string } | null) => typeof reference === 'string' ? reference : reference?.id

function newAttemptMetadata(params: CheckoutInput, customerId: string | null): AttemptMetadata {
  return { active: true, leaseToken: randomUUID(), leaseUntil: Date.now() + CHECKOUT_LEASE_MS,
    planId: params.planId, priceId: PLANS[params.planId].stripePriceId,
    appUrl: process.env.APP_URL || 'http://localhost:3000', email: params.userEmail,
    customerId, sessionId: null }
}

/** Every local claim/update is short. Network calls must stay outside these transactions. */
async function claimCheckout(params: CheckoutInput) {
  return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "Organization" WHERE id = ${params.organizationId} FOR UPDATE`
    const org = await tx.organization.findUnique({ where: { id: params.organizationId } })
    if (!org) return { error: 'Organization not found' } as const
    if (org.stripeCustomerId && org.stripeSubscriptionId && org.subscriptionStatus !== 'CANCELED') {
      return { portalCustomerId: org.stripeCustomerId } as const
    }
    const existing = await tx.activityEvent.findFirst({ where: { organizationId: org.id, eventName: CHECKOUT_EVENT, metadataJson: { path: ['active'], equals: true } }, orderBy: { createdAt: 'desc' } })
    if (existing) {
      const metadata = attemptSchema.parse(existing.metadataJson)
      if (metadata.leaseUntil > Date.now()) return pendingCheckout
      const claimed = { ...metadata, leaseToken: randomUUID(), leaseUntil: Date.now() + CHECKOUT_LEASE_MS }
      await tx.activityEvent.update({ where: { id: existing.id }, data: { metadataJson: claimed } })
      return { attempt: { id: existing.id, createdAt: existing.createdAt, metadata: claimed } } as const
    }
    const metadata = newAttemptMetadata(params, org.stripeCustomerId)
    const created = await tx.activityEvent.create({ data: { organizationId: org.id, eventName: CHECKOUT_EVENT, entityType: 'organization', entityId: org.id, metadataJson: metadata } })
    return { attempt: { id: created.id, createdAt: created.createdAt, metadata } } as const
  })
}

async function updateCheckoutAttempt(organizationId: string, attempt: CheckoutAttempt, patch: Partial<AttemptMetadata>, replace?: CheckoutInput): Promise<CheckoutAttempt> {
  return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "Organization" WHERE id = ${organizationId} FOR UPDATE`
    const row = await tx.activityEvent.findUniqueOrThrow({ where: { id: attempt.id } })
    const metadata = attemptSchema.parse(row.metadataJson)
    if (row.organizationId !== organizationId || !metadata.active || metadata.leaseToken !== attempt.metadata.leaseToken) throw new Error('Checkout claim changed')
    const updated = { ...metadata, ...patch }
    await tx.activityEvent.update({ where: { id: attempt.id }, data: { metadataJson: updated } })
    if (patch.customerId) await tx.organization.update({ where: { id: organizationId }, data: { stripeCustomerId: patch.customerId } })
    if (replace) {
      const next = newAttemptMetadata(replace, metadata.customerId)
      const created = await tx.activityEvent.create({ data: { organizationId, eventName: CHECKOUT_EVENT, entityType: 'organization', entityId: organizationId, metadataJson: next } })
      return { id: created.id, createdAt: created.createdAt, metadata: next }
    }
    return { ...attempt, metadata: updated }
  })
}

/**
 * Create a Stripe Checkout session for subscription billing.
 * This charges the platform (us), not the connected account.
 */
export async function createSubscriptionCheckout(params: CheckoutInput): Promise<{ url: string } | { error: string }> {
  const plan = PLANS[params.planId]
  if (!plan || !plan.stripePriceId) {
    return { error: `Subscription checkout is not available yet. Contact support at ${supportEmail} for help.` }
  }

  let attempt: CheckoutAttempt | undefined
  try {
    const stripe = getStripe()
    const claim = await claimCheckout(params)
    if ('error' in claim) return { error: claim.error! }
    const portal = async (customer: string) => {
      const configuration = billingPortalConfigurationId()
      const session = await stripe.billingPortal.sessions.create({ customer, return_url: `${process.env.APP_URL || 'http://localhost:3000'}/settings/billing`,
        ...(configuration ? { configuration } : {}),
      }, stripeRequest)
      return { url: session.url }
    }
    if ('portalCustomerId' in claim) return await portal(claim.portalCustomerId!)
    attempt = claim.attempt!

    // One recovery plus one plan switch is enough for this request. Never spin
    // indefinitely through ambiguous provider state.
    for (let pass = 0; pass < 3; pass++) {
      attempt = await updateCheckoutAttempt(params.organizationId, attempt, { leaseUntil: Date.now() + CHECKOUT_LEASE_MS })
      if (!attempt.metadata.customerId) {
        if (Date.now() - attempt.createdAt.getTime() >= CHECKOUT_RETRY_MS) return { error: `An earlier billing attempt needs verification. Contact support at ${supportEmail} before starting another checkout.` }
        const customer = await stripe.customers.create({ email: attempt.metadata.email, metadata: { organizationId: params.organizationId } }, { ...stripeRequest, idempotencyKey: `fieldclose-customer-${params.organizationId}` })
        attempt = await updateCheckoutAttempt(params.organizationId, attempt, { customerId: customer.id })
      }
      const customerId = attempt.metadata.customerId!
      const [subscriptions, sessions] = await Promise.all([
        stripe.subscriptions.list({ customer: customerId, status: 'all', limit: 100 }, stripeRequest),
        stripe.checkout.sessions.list({ customer: customerId, limit: 100 }, stripeRequest),
      ])
      if (subscriptions.has_more || sessions.has_more) return { error: `Your billing history needs review before another checkout can start. Contact support at ${supportEmail} for help.` }
      if (subscriptions.data.some(subscription => !['canceled', 'incomplete_expired'].includes(subscription.status))) return await portal(customerId)
      const relevant = sessions.data.filter(session => session.mode === 'subscription')
      if (relevant.some(session => session.metadata?.organizationId !== params.organizationId)) return { error: `We could not verify the existing subscription checkout. Contact support at ${supportEmail} before trying again.` }
      // A completed session may precede subscription-list/webhook visibility.
      if (relevant.some(session => session.status === 'complete' && !subscriptions.data.some(subscription => subscription.id === referenceId(session.subscription) && ['canceled', 'incomplete_expired'].includes(subscription.status)))) return pendingCheckout

      let session: Stripe.Checkout.Session | undefined = attempt.metadata.sessionId
        ? await stripe.checkout.sessions.retrieve(attempt.metadata.sessionId, stripeRequest)
        : relevant.find(candidate => candidate.metadata?.fieldcloseCheckoutAttemptId === attempt!.id)
      if (session && (referenceId(session.customer) !== customerId || session.mode !== 'subscription' || session.metadata?.organizationId !== params.organizationId)) return { error: `We could not verify the existing subscription checkout. Contact support at ${supportEmail} before trying again.` }
      const otherOpen = relevant.filter(candidate => candidate.status === 'open' && candidate.id !== session?.id)
      if (otherOpen.length > 1) return { error: `Multiple unfinished subscription checkouts need review. Contact support at ${supportEmail} before continuing.` }
      for (const previous of otherOpen) {
        attempt = await updateCheckoutAttempt(params.organizationId, attempt, { leaseUntil: Date.now() + CHECKOUT_LEASE_MS })
        const expired = await stripe.checkout.sessions.expire(previous.id, stripeRequest)
        if (expired.status !== 'expired') return pendingCheckout
      }
      if (!session) {
        if (Date.now() - attempt.createdAt.getTime() >= CHECKOUT_RETRY_MS) return { error: `An earlier checkout could not be verified. Contact support at ${supportEmail} before starting another one.` }
        attempt = await updateCheckoutAttempt(params.organizationId, attempt, { leaseUntil: Date.now() + CHECKOUT_LEASE_MS })
        const intent = attempt.metadata
        session = await stripe.checkout.sessions.create({ mode: 'subscription', line_items: [{ price: intent.priceId, quantity: 1 }],
          success_url: `${intent.appUrl}/settings?subscription=processing`, cancel_url: `${intent.appUrl}/settings/billing`, customer: customerId,
          metadata: { organizationId: params.organizationId, planId: intent.planId, fieldcloseCheckoutAttemptId: attempt.id },
          subscription_data: { metadata: { organizationId: params.organizationId, planId: intent.planId } },
        }, { ...stripeRequest, idempotencyKey: `fieldclose-subscription-${attempt.id}` })
      }
      if (session.id !== attempt.metadata.sessionId) attempt = await updateCheckoutAttempt(params.organizationId, attempt, { sessionId: session.id })
      if (session.status === 'complete') {
        if (subscriptions.data.some(subscription => subscription.id === referenceId(session!.subscription) && ['canceled', 'incomplete_expired'].includes(subscription.status))) {
          attempt = await updateCheckoutAttempt(params.organizationId, attempt, { active: false, leaseUntil: 0 }, params)
          continue
        }
        return pendingCheckout
      }
      const samePlan = attempt.metadata.planId === params.planId && attempt.metadata.priceId === plan.stripePriceId
      if (session.status === 'open' && samePlan && session.url) return { url: session.url }
      if (session.status === 'open' && !samePlan) {
        attempt = await updateCheckoutAttempt(params.organizationId, attempt, { leaseUntil: Date.now() + CHECKOUT_LEASE_MS })
        const expired = await stripe.checkout.sessions.expire(session.id, stripeRequest)
        if (expired.status !== 'expired') return pendingCheckout
        session = expired
      }
      if (session.status !== 'expired') return { error: 'This checkout is not ready. Please try again shortly.' }
      attempt = await updateCheckoutAttempt(params.organizationId, attempt, { active: false, leaseUntil: 0 }, params)
    }
    return pendingCheckout
  } catch {
    return { error: 'We could not confirm your subscription checkout. Please retry shortly; do not complete an older checkout while changing plans.' }
  } finally {
    if (attempt) await updateCheckoutAttempt(params.organizationId, attempt, { leaseUntil: 0 }).catch(() => { /* Expiring lease allows recovery of this same durable attempt. */ })
  }
}

/**
 * Check if an organization has an active subscription or is in trial.
 * An org with no trialEndsAt and no active Stripe subscription is NOT active.
 */
export function isSubscriptionActive(org: { subscriptionStatus: 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'CANCELED' | 'UNPAID' | 'INCOMPLETE'; trialEndsAt: Date | null }): boolean {
  if (org.subscriptionStatus === 'ACTIVE') return true
  if (org.subscriptionStatus === 'TRIALING') {
    if (!org.trialEndsAt) return false
    return org.trialEndsAt > new Date()
  }
  return false
}

/**
 * Check if an organization's subscription plan meets or exceeds the required plan.
 * Returns true if org's plan is at least the required plan (e.g., 'pro' >= 'starter').
 */
export function hasRequiredPlan(org: { plan: 'FREE' | 'STARTER' | 'PRO' }, requiredPlan: PlanId): boolean {
  const orgPlan = org.plan.toLowerCase() as PlanId
  
  if (orgPlan === requiredPlan) return true

  if (requiredPlan === 'starter') return orgPlan === 'pro'

  if (requiredPlan === 'pro') return false

  return false
}

/**
 * Server-only helper to enforce Pro plan requirements.
 * Redirects to /settings/billing if the org is on Starter plan.
 * Use this on Pro-only features: collections automation, accounting sync, team invites beyond Starter cap.
 *
 * @param org - Organization object with plan field
 * @param requiredPlan - Plan ID required (typically 'pro')
 * @throws Redirect to /settings/billing if plan requirement not met
 */
export function requirePlan(org: { plan: 'FREE' | 'STARTER' | 'PRO' }, requiredPlan: PlanId): void {
  if (!hasRequiredPlan(org, requiredPlan)) {
    redirect('/settings/billing')
  }
}
