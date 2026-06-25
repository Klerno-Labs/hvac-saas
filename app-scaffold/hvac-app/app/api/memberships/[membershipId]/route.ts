import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { z } from 'zod'

const patchSchema = z.object({
  action: z.enum(['pause', 'cancel', 'activate']),
})

const STATUS_MAP = { pause: 'paused', cancel: 'cancelled', activate: 'active' } as const

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ membershipId: string }> },
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const orgMember = await db.organizationMember.findFirst({
    where: { userId: session.user.id },
  })
  if (!orgMember) {
    return NextResponse.json({ error: 'No organization found' }, { status: 403 })
  }

  const { membershipId } = await params
  const body = await req.json()
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  }

  const membership = await db.membership.findFirst({
    where: { id: membershipId, organizationId: orgMember.organizationId },
  })
  if (!membership) {
    return NextResponse.json({ error: 'Membership not found' }, { status: 404 })
  }

  const updated = await db.membership.update({
    where: { id: membershipId },
    data: { status: STATUS_MAP[parsed.data.action] },
  })

  return NextResponse.json({ status: updated.status })
}
