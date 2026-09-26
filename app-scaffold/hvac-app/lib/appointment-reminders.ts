import { startOfBusinessDayAsUtcDate } from '@/lib/format'
import { db } from '@/lib/db'
import { trackEvent } from '@/lib/events'
import { sendAppointmentReminderEmail } from '@/lib/email'
import { sendAppointmentReminderSms } from '@/lib/sms'
import { isSubscriptionActive } from '@/lib/billing'

type RunResult = { sent: number; errors: number }

/**
 * Send day-ahead reminders in the business time zone. A locked job and fresh
 * state check prevent concurrent workers from dispatching it together. Email
 * retries use a stable provider idempotency key. An external send and a database
 * commit are not one transaction: crash-safe, exactly-once SMS is not guaranteed.
 */
export async function runAppointmentReminders(): Promise<RunResult> {
  const result: RunResult = { sent: 0, errors: 0 }
  const now = new Date()
  const windowStart = startOfBusinessDayAsUtcDate(now, 'UTC')
  const windowEnd = new Date(windowStart.getTime() + 3 * 24 * 60 * 60 * 1000)
  const jobs = await db.job.findMany({
    where: {
      scheduledFor: { gte: windowStart, lt: windowEnd },
      appointmentReminderSentAt: null,
      status: { notIn: ['completed', 'cancelled'] },
    },
    select: { id: true },
  })

  for (const candidate of jobs) {
    try {
      const outcome = await db.$transaction(async tx => {
        const locked = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM "Job" WHERE id = ${candidate.id}
          AND "appointmentReminderSentAt" IS NULL
          FOR UPDATE SKIP LOCKED`
        if (locked.length !== 1) return { sent: 0, errors: 0 }
        const job = await tx.job.findUnique({
          where: { id: candidate.id },
          include: {
            customer: { select: { firstName: true, lastName: true, email: true, phone: true } },
            organization: { select: { id: true, name: true, smsEnabled: true, subscriptionStatus: true, trialEndsAt: true, timezone: true } },
          },
        })
        if (!job || job.appointmentReminderSentAt || !job.scheduledFor || ['completed', 'cancelled'].includes(job.status) || !isSubscriptionActive(job.organization)) return { sent: 0, errors: 0 }
        const tomorrow = startOfBusinessDayAsUtcDate(now, job.organization.timezone)
        tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)
        if (job.scheduledFor.toISOString().slice(0, 10) !== tomorrow.toISOString().slice(0, 10)) return { sent: 0, errors: 0 }
        const customerName = [job.customer.firstName, job.customer.lastName].filter(Boolean).join(' ')
        let errors = 0
        const channels: string[] = []
        if (job.customer.email) {
          try {
            const delivery = await sendAppointmentReminderEmail({
              to: job.customer.email, customerName, jobTitle: job.title,
              orgName: job.organization.name, scheduledFor: job.scheduledFor,
              idempotencyKey: `appointment/${job.id}/${job.scheduledFor.toISOString().slice(0, 10)}/email`,
            })
            if (delivery.success) channels.push('email')
            else errors++
          } catch { errors++ }
        }
        if (job.organization.smsEnabled && job.customer.phone) {
          try {
            const delivery = await sendAppointmentReminderSms({
              to: job.customer.phone, customerName, jobTitle: job.title,
              orgName: job.organization.name, scheduledFor: job.scheduledFor,
            })
            if (delivery.success) channels.push('sms')
            else errors++
          } catch { errors++ }
        }
        if (channels.length === 0) return { sent: 0, errors }
        await tx.job.update({ where: { id: job.id }, data: { appointmentReminderSentAt: now } })
        await trackEvent({
          organizationId: job.organization.id, eventName: 'appointment_reminder_sent',
          entityType: 'job', entityId: job.id,
          metadataJson: { scheduledFor: job.scheduledFor.toISOString(), channels },
        }, tx)
        return { sent: 1, errors }
      }, { maxWait: 5000, timeout: 30_000 })
      result.sent += outcome.sent
      result.errors += outcome.errors
    } catch {
      // A database failure is observable and leaves the job eligible for retry.
      // Do not log customer addresses or provider payloads.
      console.error('Appointment reminder dispatch failed', { jobId: candidate.id })
      result.errors++
    }
  }
  return result
}
