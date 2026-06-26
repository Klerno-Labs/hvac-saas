import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { isSubscriptionActive } from '@/lib/billing'
import { resolvePeriod } from '@/lib/period'
import { getOwnerAnalytics } from '@/lib/owner-analytics'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const VALID_PERIODS = new Set(['month', 'quarter', 'ytd', 'last30'])

export async function GET(req: Request): Promise<NextResponse> {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const membership = await db.organizationMember.findFirst({
    where: { userId: session.user.id },
    include: { organization: true },
  })
  if (!membership) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const { organization } = membership
  if (!isSubscriptionActive(organization)) {
    return NextResponse.json({ error: 'subscription_required' }, { status: 402 })
  }

  const { organizationId } = membership
  const url = new URL(req.url)
  const rawPeriod = url.searchParams.get('period') ?? 'month'
  const period = VALID_PERIODS.has(rawPeriod) ? rawPeriod : 'month'

  const { start, end } = resolvePeriod(period, new Date(), organization.timezone ?? undefined)
  const analytics = await getOwnerAnalytics(organizationId, { start, end })

  return NextResponse.json(analytics)
}
