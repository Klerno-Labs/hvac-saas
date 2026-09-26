import { canDo } from '@/lib/permissions'
import { requireMutationAccess } from '@/lib/mutation-access'
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

  if (!canDo(org.role, 'manageCustomers')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const memberships = await listMembershipsForOrg({ organizationId: org.organizationId })
  return NextResponse.json(memberships)
}

export async function POST(req: Request) {
  const access = await requireMutationAccess('manageCustomers')
  if (!access.authorized) return NextResponse.json({ error: access.error }, { status: access.status })
  const { organizationId, userId } = access.context

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const parsed = enrollMembershipSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', issues: parsed.error.issues }, { status: 400 })
  }

  const customer = await db.customer.findFirst({ where: { id: parsed.data.customerId, organizationId, deletedAt: null } })
  if (!customer) return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
  if (parsed.data.recurringJobId) {
    const recurring = await db.recurringJob.findFirst({
      where: { id: parsed.data.recurringJobId, organizationId, customerId: customer.id },
    })
    if (!recurring) return NextResponse.json({ error: 'Recurring schedule not found for this customer' }, { status: 404 })
  }

  const membership = await enrollCustomer({
    organizationId,
    userId,
    input: parsed.data,
  })

  return NextResponse.json({ id: membership.id })
}
