export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { z } from 'zod'

const patchSchema = z.object({
  action: z.enum(['pause', 'cancel', 'activate']),
})

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ membershipId: string }> },
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const orgMember = await db.organizationMember.findFirst({ where: { userId: session.user.id } })
  if (!orgMember) return NextResponse.json({ error: 'No organization' }, { status: 403 })

  const { membershipId } = await params

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid action' }, { status: 422 })

  const existing = await db.membership.findFirst({
    where: { id: membershipId, organizationId: orgMember.organizationId },
  })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const status =
    parsed.data.action === 'pause'
      ? 'paused'
      : parsed.data.action === 'cancel'
        ? 'cancelled'
        : 'active'

  await db.membership.update({ where: { id: membershipId }, data: { status } })

  return NextResponse.json({ status })
}
