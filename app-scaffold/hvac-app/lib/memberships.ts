import { db } from '@/lib/db'
import { trackEvent } from '@/lib/events'
import { enrollMembershipSchema, type EnrollMembershipInput } from '@/lib/validations/membership'

type EnrollResult =
  | { success: true; membershipId: string }
  | { success: false; error: string }

type VoidResult =
  | { success: true }
  | { success: false; error: string }

export async function enrollCustomer({
  organizationId,
  userId,
  input,
}: {
  organizationId: string
  userId: string
  input: EnrollMembershipInput
}): Promise<EnrollResult> {
  const parsed = enrollMembershipSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0].message }
  }
  const data = parsed.data

  const plan = await db.membershipPlan.findFirst({
    where: { id: data.planId, organizationId, isActive: true },
  })
  if (!plan) {
    return { success: false, error: 'Membership plan not found' }
  }

  const customer = await db.customer.findFirst({
    where: { id: data.customerId, organizationId, deletedAt: null },
  })
  if (!customer) {
    return { success: false, error: 'Customer not found in your organization' }
  }

  const membership = await db.$transaction(async (tx) => {
    const recurringJob = await tx.recurringJob.create({
      data: {
        organizationId,
        customerId: data.customerId,
        title: plan.name,
        frequency: plan.cadence,
        nextDueDate: new Date(data.startDate),
        isActive: true,
      },
    })

    const newMembership = await tx.membership.create({
      data: {
        organizationId,
        planId: plan.id,
        customerId: data.customerId,
        recurringJobId: recurringJob.id,
        status: 'active',
        visitsIncluded: plan.visitsPerYear,
        startDate: new Date(data.startDate),
      },
    })

    if (data.equipmentIds.length > 0) {
      const validEquipment = await tx.equipment.findMany({
        where: {
          id: { in: data.equipmentIds },
          organizationId,
          customerId: data.customerId,
        },
        select: { id: true },
      })

      if (validEquipment.length > 0) {
        await tx.membershipEquipment.createMany({
          data: validEquipment.map((e) => ({
            membershipId: newMembership.id,
            equipmentId: e.id,
          })),
          skipDuplicates: true,
        })
      }
    }

    return newMembership
  })

  await trackEvent({
    organizationId,
    userId,
    eventName: 'membership_enrolled',
    entityType: 'membership',
    entityId: membership.id,
  })

  return { success: true, membershipId: membership.id }
}

export async function pauseMembership({
  organizationId,
  membershipId,
}: {
  organizationId: string
  membershipId: string
}): Promise<VoidResult> {
  const result = await db.membership.updateMany({
    where: { id: membershipId, organizationId },
    data: { status: 'paused' },
  })

  if (result.count === 0) {
    return { success: false, error: 'Membership not found' }
  }

  const membership = await db.membership.findFirst({
    where: { id: membershipId, organizationId },
    select: { recurringJobId: true },
  })

  if (membership?.recurringJobId) {
    await db.recurringJob.update({
      where: { id: membership.recurringJobId },
      data: { isActive: false },
    })
  }

  await trackEvent({
    organizationId,
    eventName: 'membership_paused',
    entityType: 'membership',
    entityId: membershipId,
  })

  return { success: true }
}

export async function cancelMembership({
  organizationId,
  membershipId,
}: {
  organizationId: string
  membershipId: string
}): Promise<VoidResult> {
  const now = new Date()

  const result = await db.membership.updateMany({
    where: { id: membershipId, organizationId },
    data: { status: 'cancelled', endDate: now },
  })

  if (result.count === 0) {
    return { success: false, error: 'Membership not found' }
  }

  const membership = await db.membership.findFirst({
    where: { id: membershipId, organizationId },
    select: { recurringJobId: true },
  })

  if (membership?.recurringJobId) {
    await db.recurringJob.update({
      where: { id: membership.recurringJobId },
      data: { isActive: false },
    })
  }

  await trackEvent({
    organizationId,
    eventName: 'membership_cancelled',
    entityType: 'membership',
    entityId: membershipId,
  })

  return { success: true }
}

export async function listMembershipsForOrg({
  organizationId,
}: {
  organizationId: string
}) {
  return db.membership.findMany({
    where: { organizationId },
    include: {
      plan: true,
      customer: true,
      coveredEquipment: {
        include: { equipment: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  })
}
