export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { enrollMembershipSchema } from '@/lib/validations/membership'

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const orgMember = await db.organizationMember.findFirst({ where: { userId: session.user.id } })
  if (!orgMember) return NextResponse.json({ error: 'No organization' }, { status: 403 })

  const organizationId = orgMember.organizationId

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = enrollMembershipSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 422 })
  }

  const { planId, customerId, startDate, equipmentIds } = parsed.data

  const plan = await db.membershipPlan.findFirst({
    where: { id: planId, organizationId, isActive: true },
  })
  if (!plan) return NextResponse.json({ error: 'Plan not found' }, { status: 404 })

  const customer = await db.customer.findFirst({
    where: { id: customerId, organizationId, deletedAt: null },
  })
  if (!customer) return NextResponse.json({ error: 'Customer not found' }, { status: 404 })

  if (equipmentIds.length > 0) {
    const count = await db.equipment.count({
      where: { id: { in: equipmentIds }, organizationId },
    })
    if (count !== equipmentIds.length) {
      return NextResponse.json({ error: 'One or more equipment items not found' }, { status: 400 })
    }
  }

  const membership = await db.membership.create({
    data: {
      organizationId,
      planId,
      customerId,
      startDate: new Date(startDate),
      coveredEquipment:
        equipmentIds.length > 0
          ? { connect: equipmentIds.map((id) => ({ id })) }
          : undefined,
    },
  })

  return NextResponse.json({ membershipId: membership.id }, { status: 201 })
}
