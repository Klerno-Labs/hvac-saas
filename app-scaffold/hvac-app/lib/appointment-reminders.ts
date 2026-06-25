import { db } from '@/lib/db'
import { trackEvent } from '@/lib/events'
import { sendAppointmentReminderEmail } from '@/lib/email'
import { sendAppointmentReminderSms } from '@/lib/sms'
import { isSubscriptionActive } from '@/lib/billing'

type RunResult = {
  sent: number
  errors: number
}

/**
 * Send appointment reminders for all jobs scheduled in the next 24 hours
 * that have not yet had a reminder dispatched (appointmentReminderSentAt is null).
 * Idempotent: marking appointmentReminderSentAt prevents re-delivery on re-runs.
 */
export async function runAppointmentReminders(): Promise<RunResult> {
  const result: RunResult = { sent: 0, errors: 0 }

  const now = new Date()
  const windowEnd = new Date(now.getTime() + 24 * 60 * 60 * 1000)

  const jobs = await db.job.findMany({
    where: {
      scheduledFor: { gt: now, lte: windowEnd },
      appointmentReminderSentAt: null,
      status: { notIn: ['completed', 'cancelled'] },
    },
    include: {
      customer: {
        select: { firstName: true, lastName: true, email: true, phone: true },
      },
      organization: {
        select: {
          id: true,
          name: true,
          smsEnabled: true,
          subscriptionStatus: true,
          trialEndsAt: true,
        },
      },
    },
  })

  for (const job of jobs) {
    if (!isSubscriptionActive(job.organization)) continue
    if (!job.scheduledFor) continue

    const customerName = [job.customer.firstName, job.customer.lastName].filter(Boolean).join(' ')
    let jobSent = false

    if (job.customer.email) {
      try {
        await sendAppointmentReminderEmail({
          to: job.customer.email,
          customerName,
          jobTitle: job.title,
          orgName: job.organization.name,
          scheduledFor: job.scheduledFor,
        })
        jobSent = true
      } catch (error) {
        console.error(`Appointment reminder email failed for job ${job.id}:`, error)
        result.errors++
      }
    }

    if (job.organization.smsEnabled && job.customer.phone) {
      try {
        await sendAppointmentReminderSms({
          to: job.customer.phone,
          customerName,
          jobTitle: job.title,
          orgName: job.organization.name,
          scheduledFor: job.scheduledFor,
        })
        jobSent = true
      } catch (error) {
        console.error(`Appointment reminder SMS failed for job ${job.id}:`, error)
        result.errors++
      }
    }

    if (jobSent || (!job.customer.email && !job.customer.phone)) {
      await db.job.update({
        where: { id: job.id },
        data: { appointmentReminderSentAt: now },
      })

      if (jobSent) {
        await trackEvent({
          organizationId: job.organization.id,
          eventName: 'appointment_reminder_sent',
          entityType: 'job',
          entityId: job.id,
          metadataJson: { scheduledFor: job.scheduledFor.toISOString() },
        })
        result.sent++
      }
    }
  }

  return result
}
