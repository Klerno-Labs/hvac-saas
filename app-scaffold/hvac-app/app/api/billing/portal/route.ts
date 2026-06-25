import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/require-admin'
import { createSubscriptionCheckout } from '@/lib/billing'
import { getStripe } from '@/lib/stripe'
import { db } from '@/lib/db'

export const runtime = 'nodejs'

/**
 * POST /api/billing/portal
 *
 * Opens the Stripe customer billing portal for the organization owner so they
 * can manage their subscription / payment method. For orgs that don't yet have
 * a Stripe customer record, falls back to a checkout session for their current
 * plan so they can subscribe / reactivate.
 *
 * Owner-only. Returns only `{ url }` — no Stripe customer ids, keys, or any
 * other tenant's data reach the client.
 */
export async function POST() {
  const admin = await requireAdmin()
  if (!admin.authorized) {
    return NextResponse.json({ error: admin.error }, { status: 403 })
  }

  const { organizationId, userEmail } = admin.context

  try {
    const org = await db.organization.findUnique({
      where: { id: organizationId },
      select: { stripeCustomerId: true, plan: true },
    })
    if (!org) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    const appUrl = process.env.APP_URL || 'http://localhost:3000'

    // Existing Stripe customer → billing portal (manage card, cancel, etc).
    if (org.stripeCustomerId) {
      const session = await getStripe().billingPortal.sessions.create({
        customer: org.stripeCustomerId,
        return_url: `${appUrl}/settings/billing`,
      })
      return NextResponse.json({ url: session.url })
    }

    // No customer yet → checkout to (re)activate on their current plan.
    const result = await createSubscriptionCheckout({
      organizationId,
      planId: org.plan.toLowerCase() === 'pro' ? 'pro' : 'starter',
      userEmail: userEmail ?? '',
    })

    if ('url' in result) {
      return NextResponse.json({ url: result.url })
    }
    return NextResponse.json({ error: result.error }, { status: 400 })
  } catch (error) {
    console.error('Failed to create billing portal session', error)
    return NextResponse.json(
      { error: 'Could not open billing portal. Please try again.' },
      { status: 500 },
    )
  }
}
