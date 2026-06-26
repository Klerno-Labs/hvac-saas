import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { isSubscriptionActive } from '@/lib/billing'
import { getOwnerAnalytics } from '@/lib/owner-analytics'
import { resolvePeriod } from '@/lib/period'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: Request) {
  // Use auth() directly — requireActiveSubscription() calls redirect() which is
  // unsuitable inside a route handler (produces a redirect, not a 401 JSON body).
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const membership = await db.organizationMember.findFirst({
    where: { userId: session.user.id },
    include: { organization: true },
  })

  if (!membership || !isSubscriptionActive(membership.organization)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const { organizationId, organization } = membership

  const { searchParams } = new URL(request.url)
  const periodParam = searchParams.get('period') ?? 'month'
  const period = resolvePeriod(periodParam, new Date(), organization.timezone ?? undefined)

  const analytics = await getOwnerAnalytics(organizationId, period)
  return NextResponse.json(analytics)
}
