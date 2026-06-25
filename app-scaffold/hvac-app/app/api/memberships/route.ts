import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { enrollMembershipSchema } from '@/lib/validations/membership'
import { enrollCustomer, listMembershipsForOrg } from '@/lib/memberships'

export const runtime = 'nodejs'

async function resolveOrgMember(userId: string) {
  return db.organizationMember.findFirst({ where: { userId } })
}

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const member = await resolveOrgMember(session.user.id)
  if (!member) {
    return NextResponse.json({ error: 'No organization membership' }, { status: 403 })
  }
  const memberships = await listMembershipsForOrg({ organizationId: member.organizationId })
  return NextResponse.json(memberships)
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const member = await resolveOrgMember(session.user.id)
  if (!member) {
    return NextResponse.json({ error: 'No organization membership' }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  const parsed = enrollMembershipSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const membership = await enrollCustomer({
    organizationId: member.organizationId,
    userId: session.user.id,
    input: parsed.data,
  })

  return NextResponse.json({ id: membership.id })
}
