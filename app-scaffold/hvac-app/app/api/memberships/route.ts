import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { enrollMembershipSchema } from '@/lib/validations/membership'

export async function POST(req: NextRequest) {
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

  const organizationId = orgMember.organizationId

  const body = await req.json()
  const parsed = enrollMembershipSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 })
  }

  const { planId, customerId, startDate, equipmentIds } = parsed.data

  const plan = await db.membershipPlan.findFirst({
    where: { id: planId, organizationId },
  })
  if (!plan) {
    return NextResponse.json({ error: 'Plan not found' }, { status: 404 })
  }

  const customer = await db.customer.findFirst({
    where: { id: customerId, organizationId, deletedAt: null },
  })
  if (!customer) {
    return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
  }

  if (equipmentIds.length > 0) {
    const count = await db.equipment.count({
      where: { id: { in: equipmentIds }, organizationId, customerId },
    })
    if (count !== equipmentIds.length) {
      return NextResponse.json({ error: 'Invalid equipment selection' }, { status: 400 })
    }
  }

  const membership = await db.membership.create({
    data: {
      organizationId,
      planId,
      customerId,
      startDate: new Date(startDate),
      coveredEquipment: equipmentIds.length > 0
        ? { connect: equipmentIds.map((id) => ({ id })) }
        : undefined,
    },
  })

  return NextResponse.json({ id: membership.id }, { status: 201 })
}
