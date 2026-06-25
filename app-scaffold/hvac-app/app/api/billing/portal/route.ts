import { NextResponse } from 'next/server'
import { getStripe } from '@/lib/stripe'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/session'

/**
 * POST /api/billing/portal
 *
 * Creates a Stripe Billing Portal session for the authenticated user's org and
 * returns `{ url }`. The client redirects there to manage the subscription
 * (update card, swap plan, cancel).
 *
 * Auth/org resolution comes from the SESSION only — never from the request
 * body — so a client cannot open a portal for another org. We use requireAuth()
 * (not requireActiveSubscription) deliberately: read-only/frozen orgs MUST be
 * able to reach the portal, since paying is how they unfreeze.
 *
 * If the org has no stripeCustomerId yet, we create the Stripe customer and
 * persist it via an org-scoped update before opening the portal.
 */
export async function POST() {
  const { organizationId, organization } = await requireAuth()

  const stripe = getStripe()
  const appUrl = process.env.APP_URL || 'http://localhost:3000'

  let customerId = organization.stripeCustomerId

  if (!customerId) {
    const customer = await stripe.customers.create({
      name: organization.name,
      email: organization.email ?? undefined,
      metadata: { organizationId },
    })
    customerId = customer.id
    // Org-scoped update — never trust a customerId from the client.
    await db.organization.update({
      where: { id: organizationId },
      data: { stripeCustomerId: customerId },
    })
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${appUrl}/settings/billing`,
  })

  return NextResponse.json({ url: session.url })
}
