import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { getStripe } from '@/lib/stripe'
import { NextResponse } from 'next/server'

export async function POST() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const membership = await db.organizationMember.findFirst({
    where: { userId: session.user.id },
    include: { organization: { select: { id: true, stripeCustomerId: true } } },
  })

  if (!membership) {
    return NextResponse.json({ error: 'No organization found' }, { status: 404 })
  }

  const { stripeCustomerId } = membership.organization
  if (!stripeCustomerId) {
    return NextResponse.json(
      { error: 'No billing account found. Subscribe first to manage billing.' },
      { status: 400 }
    )
  }

  const stripe = getStripe()
  const appUrl = process.env.APP_URL || 'http://localhost:3000'

  const portalSession = await stripe.billingPortal.sessions.create({
    customer: stripeCustomerId,
    return_url: `${appUrl}/settings/billing`,
  })

  return NextResponse.json({ url: portalSession.url })
}
