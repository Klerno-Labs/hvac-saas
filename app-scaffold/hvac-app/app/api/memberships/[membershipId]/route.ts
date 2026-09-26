import { NextResponse } from 'next/server'
import { requireMutationAccess } from '@/lib/mutation-access'
import { pauseMembership, cancelMembership } from '@/lib/memberships'

export const runtime = 'nodejs'

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ membershipId: string }> },
) {
  const access = await requireMutationAccess('manageCustomers')
  if (!access.authorized) return NextResponse.json({ error: access.error }, { status: access.status })
  const { organizationId } = access.context

  const { membershipId } = await ctx.params
  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const action = body && typeof body === 'object' && 'action' in body ? body.action : null

  if (action === 'pause') {
    const result = await pauseMembership({ organizationId, membershipId })
    if (!result.count) return NextResponse.json({ error: 'Membership not found' }, { status: 404 })
    return NextResponse.json({ success: true })
  }

  if (action === 'cancel') {
    const result = await cancelMembership({ organizationId, membershipId })
    if (!result.count) return NextResponse.json({ error: 'Membership not found' }, { status: 404 })
    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
