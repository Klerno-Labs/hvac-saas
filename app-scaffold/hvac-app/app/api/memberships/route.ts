import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { enrollMembershipSchema } from '@/lib/validations/membership'
import { enrollCustomer, listMembershipsForOrg } from '@/lib/memberships'

export const runtime = 'nodejs'

export async function GET() {
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

  const memberships = await listMembershipsForOrg({ organizationId: org.organizationId })
  return NextResponse.json(memberships)
}

export async function POST(req: Request) {
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

  const body = await req.json()
  const parsed = enrollMembershipSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', issues: parsed.error.issues }, { status: 400 })
  }

  const membership = await enrollCustomer({
    organizationId: org.organizationId,
    userId: session.user.id,
    input: parsed.data,
  })

  return NextResponse.json({ id: membership.id })
}
