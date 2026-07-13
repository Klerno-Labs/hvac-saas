import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { pauseMembership, cancelMembership } from '@/lib/memberships'

export const runtime = 'nodejs'

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ membershipId: string }> },
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const org = await db.organizationMember.findFirst({
    where: { userId: session.user.id },
  })
  if (!org) {
    return NextResponse.json({ error: 'No organization' }, { status: 403 })
  }

  const { membershipId } = await ctx.params
  const body = await req.json()
  const { action } = body

  if (action === 'pause') {
    await pauseMembership({ organizationId: org.organizationId, membershipId })
    return NextResponse.json({ success: true })
  }

  if (action === 'cancel') {
    await cancelMembership({ organizationId: org.organizationId, membershipId })
    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
