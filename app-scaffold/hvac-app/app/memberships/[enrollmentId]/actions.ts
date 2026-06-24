'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { trackEvent } from '@/lib/events'
import { logAudit } from '@/lib/audit'
import { revalidatePath } from 'next/cache'

type Result = { success: true } | { success: false; error: string }

async function getOrgContext() {
  const session = await auth()
  if (!session?.user?.id) return null
  const membership = await db.organizationMember.findFirst({ where: { userId: session.user.id } })
  if (!membership) return null
  return { userId: session.user.id, organizationId: membership.organizationId }
}

async function findEnrollment(enrollmentId: string, organizationId: string) {
  return db.membershipEnrollment.findFirst({
    where: { id: enrollmentId, organizationId },
    include: { plan: { select: { name: true } }, _count: { select: { schedules: true } } },
  })
}

/**
 * Pause an active enrollment: sets status to 'paused' and deactivates its
 * driving RecurringJob(s) so the recurring cron stops generating visits.
 */
export async function pauseEnrollment(enrollmentId: string): Promise<Result> {
  const ctx = await getOrgContext()
  if (!ctx) return { success: false, error: 'You must be logged in' }

  const enrollment = await findEnrollment(enrollmentId, ctx.organizationId)
  if (!enrollment) return { success: false, error: 'Enrollment not found' }
  if (enrollment.status !== 'active') {
    return { success: false, error: 'Only active enrollments can be paused' }
  }

  await db.$transaction([
    db.membershipEnrollment.update({
      where: { id: enrollmentId },
      data: { status: 'paused' },
    }),
    db.recurringJob.updateMany({
      where: { membershipId: enrollmentId },
      data: { isActive: false },
    }),
  ])

  await trackEvent({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    eventName: 'membership_paused',
    entityType: 'membership_enrollment',
    entityId: enrollmentId,
  })
  await logAudit({
    organizationId: ctx.organizationId,
    actorId: ctx.userId,
    eventType: 'membership_paused',
    targetType: 'membership_enrollment',
    targetId: enrollmentId,
    metadata: { plan: enrollment.plan.name },
  })

  revalidatePath(`/memberships/${enrollmentId}`)
  revalidatePath('/memberships')
  return { success: true }
}

/** Reactivate a paused enrollment and resume its driving schedule(s). */
export async function activateEnrollment(enrollmentId: string): Promise<Result> {
  const ctx = await getOrgContext()
  if (!ctx) return { success: false, error: 'You must be logged in' }

  const enrollment = await findEnrollment(enrollmentId, ctx.organizationId)
  if (!enrollment) return { success: false, error: 'Enrollment not found' }
  if (enrollment.status !== 'paused') {
    return { success: false, error: 'Only paused enrollments can be reactivated' }
  }

  await db.$transaction([
    db.membershipEnrollment.update({
      where: { id: enrollmentId },
      data: { status: 'active' },
    }),
    db.recurringJob.updateMany({
      where: { membershipId: enrollmentId },
      data: { isActive: true },
    }),
  ])

  await trackEvent({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    eventName: 'membership_reactivated',
    entityType: 'membership_enrollment',
    entityId: enrollmentId,
  })
  await logAudit({
    organizationId: ctx.organizationId,
    actorId: ctx.userId,
    eventType: 'membership_reactivated',
    targetType: 'membership_enrollment',
    targetId: enrollmentId,
    metadata: { plan: enrollment.plan.name },
  })

  revalidatePath(`/memberships/${enrollmentId}`)
  revalidatePath('/memberships')
  return { success: true }
}

/**
 * Cancel an enrollment permanently (keeps the record for history). Deactivates
 * the driving RecurringJob(s) so no further visits are generated. Covered
 * equipment links are left intact for historical traceability.
 */
export async function cancelEnrollment(enrollmentId: string): Promise<Result> {
  const ctx = await getOrgContext()
  if (!ctx) return { success: false, error: 'You must be logged in' }

  const enrollment = await findEnrollment(enrollmentId, ctx.organizationId)
  if (!enrollment) return { success: false, error: 'Enrollment not found' }
  if (enrollment.status === 'cancelled') {
    return { success: false, error: 'Enrollment is already cancelled' }
  }

  await db.$transaction([
    db.membershipEnrollment.update({
      where: { id: enrollmentId },
      data: { status: 'cancelled' },
    }),
    db.recurringJob.updateMany({
      where: { membershipId: enrollmentId },
      data: { isActive: false },
    }),
  ])

  await trackEvent({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    eventName: 'membership_cancelled',
    entityType: 'membership_enrollment',
    entityId: enrollmentId,
  })
  await logAudit({
    organizationId: ctx.organizationId,
    actorId: ctx.userId,
    eventType: 'membership_cancelled',
    targetType: 'membership_enrollment',
    targetId: enrollmentId,
    metadata: { plan: enrollment.plan.name },
  })

  revalidatePath(`/memberships/${enrollmentId}`)
  revalidatePath('/memberships')
  return { success: true }
}

/** Add an already-existing customer equipment item to an enrollment's coverage. */
export async function addCoveredEquipment(enrollmentId: string, equipmentId: string): Promise<Result> {
  const ctx = await getOrgContext()
  if (!ctx) return { success: false, error: 'You must be logged in' }

  const enrollment = await db.membershipEnrollment.findFirst({
    where: { id: enrollmentId, organizationId: ctx.organizationId },
    select: { id: true, customerId: true, status: true },
  })
  if (!enrollment) return { success: false, error: 'Enrollment not found' }

  const equipment = await db.equipment.findFirst({
    where: { id: equipmentId, organizationId: ctx.organizationId, customerId: enrollment.customerId, status: 'active' },
    select: { id: true },
  })
  if (!equipment) return { success: false, error: 'Equipment not found for this customer' }

  try {
    await db.membershipEquipment.create({
      data: { organizationId: ctx.organizationId, membershipEnrollmentId: enrollmentId, equipmentId },
    })
  } catch {
    // Unique constraint => already covered.
    return { success: false, error: 'That equipment is already covered' }
  }

  revalidatePath(`/memberships/${enrollmentId}`)
  return { success: true }
}

/** Remove an equipment item from an enrollment's coverage. */
export async function removeCoveredEquipment(enrollmentId: string, equipmentId: string): Promise<Result> {
  const ctx = await getOrgContext()
  if (!ctx) return { success: false, error: 'You must be logged in' }

  const link = await db.membershipEquipment.findFirst({
    where: { membershipEnrollmentId: enrollmentId, equipmentId, organizationId: ctx.organizationId },
    select: { id: true },
  })
  if (!link) return { success: false, error: 'Coverage not found' }

  await db.membershipEquipment.delete({ where: { id: link.id } })

  revalidatePath(`/memberships/${enrollmentId}`)
  return { success: true }
}
