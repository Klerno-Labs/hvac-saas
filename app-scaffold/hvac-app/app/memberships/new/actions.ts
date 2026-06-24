'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { trackEvent } from '@/lib/events'
import { logAudit } from '@/lib/audit'
import { createMembershipEnrollmentSchema } from '@/lib/validations/membership'
import { membershipScheduleTitle } from '@/lib/memberships'

type EnrollResult =
  | { success: true; enrollmentId: string }
  | { success: false; error: string }

function customerLabel(c: { firstName: string; lastName: string | null; companyName: string | null }): string {
  const name = `${c.firstName} ${c.lastName || ''}`.trim()
  return c.companyName ? `${name} (${c.companyName})` : name
}

/**
 * Enroll a customer in a membership plan. Within a single transaction this:
 *   1. creates the MembershipEnrollment,
 *   2. creates the driving RecurringJob (cadence = plan.visitFrequency,
 *      first visit = effectiveDate) so the existing recurring cron generates
 *      the covered visits, and
 *   3. links the selected covered Equipment.
 */
export async function enrollCustomer(formData: FormData): Promise<EnrollResult> {
  const session = await auth()
  if (!session?.user?.id) {
    return { success: false, error: 'You must be logged in' }
  }

  const membership = await db.organizationMember.findFirst({ where: { userId: session.user.id } })
  if (!membership) {
    return { success: false, error: 'You must belong to an organization' }
  }
  const organizationId = membership.organizationId

  const raw = {
    customerId: formData.get('customerId'),
    planId: formData.get('planId'),
    effectiveDate: formData.get('effectiveDate'),
    notes: formData.get('notes') || undefined,
    equipmentIds: formData.getAll('equipmentIds'),
  }

  const parsed = createMembershipEnrollmentSchema.safeParse(raw)
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0].message }
  }
  const data = parsed.data

  const effectiveDate = new Date(data.effectiveDate)
  if (isNaN(effectiveDate.getTime())) {
    return { success: false, error: 'Invalid effective date' }
  }

  const plan = await db.membershipPlan.findFirst({
    where: { id: data.planId, organizationId },
  })
  if (!plan) {
    return { success: false, error: 'Plan not found' }
  }
  if (!plan.isActive) {
    return { success: false, error: 'That plan is retired and cannot be used' }
  }

  const customer = await db.customer.findFirst({
    where: { id: data.customerId, organizationId, deletedAt: null },
  })
  if (!customer) {
    return { success: false, error: 'Customer not found' }
  }

  // Prevent duplicate active enrollments of the same plan for a customer.
  const existing = await db.membershipEnrollment.findFirst({
    where: { customerId: data.customerId, planId: data.planId, status: 'active' },
    select: { id: true },
  })
  if (existing) {
    return { success: false, error: 'This customer already has an active enrollment for that plan' }
  }

  // Validate every selected equipment belongs to the same customer + org.
  let equipmentRows: { id: string }[] = []
  if (data.equipmentIds.length > 0) {
    equipmentRows = await db.equipment.findMany({
      where: {
        id: { in: data.equipmentIds },
        organizationId,
        customerId: data.customerId,
        status: 'active',
      },
      select: { id: true },
    })
    if (equipmentRows.length !== data.equipmentIds.length) {
      return {
        success: false,
        error: 'One or more selected equipment items were not found for this customer',
      }
    }
  }

  const label = customerLabel(customer)

  const enrollment = await db.$transaction(async (tx) => {
    const created = await tx.membershipEnrollment.create({
      data: {
        organizationId,
        customerId: data.customerId,
        planId: data.planId,
        status: 'active',
        effectiveDate,
        notes: data.notes ?? null,
      },
    })

    await tx.recurringJob.create({
      data: {
        organizationId,
        customerId: data.customerId,
        title: membershipScheduleTitle(plan.name, label),
        description: plan.description ?? `Membership: ${plan.name}`,
        frequency: plan.visitFrequency,
        nextDueDate: effectiveDate,
        isActive: true,
        membershipId: created.id,
      },
    })

    if (equipmentRows.length > 0) {
      await tx.membershipEquipment.createMany({
        data: equipmentRows.map((e) => ({
          organizationId,
          membershipEnrollmentId: created.id,
          equipmentId: e.id,
        })),
      })
    }

    return created
  })

  await trackEvent({
    organizationId,
    userId: session.user.id,
    eventName: 'membership_enrolled',
    entityType: 'membership_enrollment',
    entityId: enrollment.id,
    metadataJson: {
      customerId: data.customerId,
      planId: data.planId,
      coveredEquipmentCount: equipmentRows.length,
    },
  })
  await logAudit({
    organizationId,
    actorId: session.user.id,
    eventType: 'membership_enrolled',
    targetType: 'membership_enrollment',
    targetId: enrollment.id,
    metadata: { customerId: data.customerId, planId: data.planId },
  })

  return { success: true, enrollmentId: enrollment.id }
}
