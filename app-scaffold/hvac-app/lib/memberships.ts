import { db } from '@/lib/db'
import { trackEvent } from '@/lib/events'
import { EnrollMembershipInput } from '@/lib/validations/membership'

type EnrollResult =
  | { success: true; membershipId: string }
  | { success: false; error: string }

type StatusResult =
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
  const plan = await db.membershipPlan.findFirst({
    where: { id: input.planId, organizationId, isActive: true },
  })
  if (!plan) {
    return { success: false, error: 'Membership plan not found in your organization' }
  }

  const customer = await db.customer.findFirst({
    where: { id: input.customerId, organizationId, deletedAt: null },
  })
  if (!customer) {
    return { success: false, error: 'Customer not found in your organization' }
  }

  const membership = await db.$transaction(async (tx) => {
    const recurringJob = await tx.recurringJob.create({
      data: {
        organizationId,
        customerId: input.customerId,
        title: plan.name,
        frequency: plan.cadence,
        nextDueDate: new Date(input.startDate),
        isActive: true,
      },
    })

    const newMembership = await tx.membership.create({
      data: {
        organizationId,
        customerId: input.customerId,
        planId: input.planId,
        recurringJobId: recurringJob.id,
        status: 'active',
        visitsIncluded: plan.visitsPerYear,
        startDate: new Date(input.startDate),
      },
    })

    if (input.equipmentIds.length > 0) {
      const validEquipment = await tx.equipment.findMany({
        where: {
          id: { in: input.equipmentIds },
          organizationId,
          customerId: input.customerId,
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
}): Promise<StatusResult> {
  const result = await db.membership.updateMany({
    where: { id: membershipId, organizationId },
    data: { status: 'paused' },
  })

  if (result.count === 0) {
    return { success: false, error: 'Membership not found in your organization' }
  }

  const membership = await db.membership.findFirst({
    where: { id: membershipId, organizationId },
    select: { recurringJobId: true },
  })

  if (membership?.recurringJobId) {
    await db.recurringJob.updateMany({
      where: { id: membership.recurringJobId, organizationId },
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
}): Promise<StatusResult> {
  const result = await db.membership.updateMany({
    where: { id: membershipId, organizationId },
    data: { status: 'cancelled', endDate: new Date() },
  })

  if (result.count === 0) {
    return { success: false, error: 'Membership not found in your organization' }
  }

  const membership = await db.membership.findFirst({
    where: { id: membershipId, organizationId },
    select: { recurringJobId: true },
  })

  if (membership?.recurringJobId) {
    await db.recurringJob.updateMany({
      where: { id: membership.recurringJobId, organizationId },
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

export async function listMembershipsForOrg({ organizationId }: { organizationId: string }) {
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
