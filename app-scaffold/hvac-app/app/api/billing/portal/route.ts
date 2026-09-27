import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/session'
import { db } from '@/lib/db'
import { getStripe } from '@/lib/stripe'
import { billingPortalConfigurationId } from '@/lib/billing-portal'

export async function POST() {
  // requireAuth (not requireActiveSubscription) so frozen orgs can still reach the portal to pay
  const { organizationId, organization, role } = await requireAuth()
  if (role !== 'owner') return NextResponse.json({error: 'Only organization owners can manage billing'}, {status: 403})

  let configuration: string | undefined
  try { configuration = billingPortalConfigurationId() } catch {
    return NextResponse.json({ error: 'Billing portal setup needs attention. Please contact support.' }, { status: 503 })
  }
  const stripe = getStripe()
  const appUrl = process.env.APP_URL || 'http://localhost:3000'

  let { stripeCustomerId } = organization

  if (!stripeCustomerId) {
    const customer = await stripe.customers.create({
      name: organization.name,
      metadata: { organizationId },
    }, {idempotencyKey: `fieldclose-customer-${organizationId}`})
    stripeCustomerId = customer.id
    await db.organization.update({
      where: { id: organizationId },
      data: { stripeCustomerId },
    })
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: stripeCustomerId,
    return_url: `${appUrl}/settings/billing`,
    ...(configuration ? { configuration } : {}),
  })

  return NextResponse.json({ url: session.url })
}
