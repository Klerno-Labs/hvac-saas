import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/session'
import { db } from '@/lib/db'
import { getStripe } from '@/lib/stripe'

export async function POST() {
  // requireAuth (not requireActiveSubscription) so frozen orgs can still reach the portal to pay
  const { organizationId, organization } = await requireAuth()

  const stripe = getStripe()
  const appUrl = process.env.APP_URL || 'http://localhost:3000'

  let { stripeCustomerId } = organization

  if (!stripeCustomerId) {
    const customer = await stripe.customers.create({
      name: organization.name,
      metadata: { organizationId },
    })
    stripeCustomerId = customer.id
    await db.organization.update({
      where: { id: organizationId },
      data: { stripeCustomerId },
    })
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: stripeCustomerId,
    return_url: `${appUrl}/settings/billing`,
  })

  return NextResponse.json({ url: session.url })
}
