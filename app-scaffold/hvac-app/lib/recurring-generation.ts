import { db } from '@/lib/db'
import { isSubscriptionActive } from '@/lib/billing'
import { calculateNextDueDate } from '@/lib/recurring-cadence'
import { trackEvent } from '@/lib/events'

/** At most one visit per schedule snapshot, even when scheduled runs overlap. */
export async function generateDueRecurringJobs(now = new Date()) {
  const due = await db.recurringJob.findMany({
    where: {
      isActive: true,
      nextDueDate: { lte: now },
      customer: { deletedAt: null },
      organization: {
        readOnlyAt: null,
        OR: [{ subscriptionStatus: 'ACTIVE' }, { subscriptionStatus: 'TRIALING', trialEndsAt: { gt: now } }],
      },
      OR: [{ membership: null }, { membership: { status: 'active' } }],
    },
    orderBy: [{ nextDueDate: 'asc' }, { id: 'asc' }],
    take: 500,
    select: { id: true, nextDueDate: true },
  })
  let generated = 0
  let generatedMembershipVisits = 0
  for (const snapshot of due) {
    const result = await db.$transaction(async tx => {
      // PostgreSQL row locking makes this safe across workers, not just in-process.
      await tx.$queryRaw`SELECT id FROM "RecurringJob" WHERE id = ${snapshot.id} FOR UPDATE`
      const schedule = await tx.recurringJob.findUnique({
        where: { id: snapshot.id }, include: { organization: true, customer: true, membership: true },
      })
      if (!schedule || !schedule.isActive || schedule.nextDueDate.getTime() !== snapshot.nextDueDate.getTime() ||
          schedule.customer.deletedAt || schedule.organization.readOnlyAt || !isSubscriptionActive(schedule.organization)) return null
      let membershipId: string | null = null
      if (schedule.membership) {
        await tx.$queryRaw`SELECT id FROM "Membership" WHERE id = ${schedule.membership.id} FOR UPDATE`
        const membership = await tx.membership.findUnique({ where: { id: schedule.membership.id } })
        if (!membership || membership.status !== 'active' || membership.organizationId !== schedule.organizationId ||
            membership.customerId !== schedule.customerId) return null
        membershipId = membership.id
      }
      const job = await tx.job.create({
        data: {
          organizationId: schedule.organizationId, customerId: schedule.customerId,
          title: schedule.title, status: 'draft', notes: schedule.description, scheduledFor: schedule.nextDueDate,
        },
      })
      await tx.recurringJob.update({
        where: { id: schedule.id },
        data: { lastGeneratedAt: now, nextDueDate: calculateNextDueDate(schedule.nextDueDate, schedule.frequency) },
      })
      if (membershipId) await tx.membership.update({ where: { id: membershipId }, data: { visitsUsed: { increment: 1 } } })
      await trackEvent({
        organizationId: schedule.organizationId,
        eventName: membershipId ? 'membership_visit_generated' : 'recurring_job_generated',
        entityType: 'job', entityId: job.id,
        metadataJson: { recurringJobId: schedule.id, membershipId, scheduledFor: schedule.nextDueDate.toISOString() },
      }, tx)
      return { membershipVisit: Boolean(membershipId) }
    })
    if (result) {
      generated++
      if (result.membershipVisit) generatedMembershipVisits++
    }
  }
  return { generated, generatedMembershipVisits }
}
