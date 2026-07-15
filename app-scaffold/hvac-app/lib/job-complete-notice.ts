import { randomBytes } from 'crypto'
import { db } from '@/lib/db'
import { trackEvent } from '@/lib/events'
import { sendJobCompleteEmail } from '@/lib/email'
import { sendJobCompleteSms } from '@/lib/sms'
import { getOrCreatePortalUrl } from '@/lib/portal'

type NoticeResult = { sent: boolean; channels: string[]; skippedReason?: string }

export async function sendJobCompleteNotice(
  jobId: string,
  organizationId: string,
): Promise<NoticeResult> {
  try {
    const job = await db.job.findFirst({
      where: { id: jobId, organizationId },
      include: {
        customer: true,
        organization: {
          select: { name: true, smsEnabled: true, jobCompletionNoticeEnabled: true },
        },
        invoices: true,
      },
    })

    if (!job) return { sent: false, channels: [], skippedReason: 'job_not_found' }
    if (job.status !== 'completed') return { sent: false, channels: [], skippedReason: 'not_completed' }
    if (job.completionNoticeSentAt != null) return { sent: false, channels: [], skippedReason: 'already_sent' }
    if (job.organization.jobCompletionNoticeEnabled === false) return { sent: false, channels: [], skippedReason: 'disabled' }

    const openInvoice =
      job.invoices
        .filter(inv => ['sent', 'overdue'].includes(inv.status) && inv.outstandingCents > 0)
        .sort((a, b) => b.outstandingCents - a.outstandingCents)[0] ?? null

    const outstandingFormatted = openInvoice
      ? '$' + (openInvoice.outstandingCents / 100).toFixed(2)
      : undefined

    const payUrl = openInvoice
      ? await getOrCreatePortalUrl(organizationId, job.customerId)
      : undefined

    const existingReview = await db.customerReview.findUnique({ where: { jobId } })
    let reviewToken: string
    if (existingReview) {
      reviewToken = existingReview.token
    } else {
      reviewToken = randomBytes(32).toString('hex')
      await db.customerReview.create({
        data: {
          organizationId,
          jobId,
          customerId: job.customerId,
          rating: 0,
          token: reviewToken,
        },
      })
    }
    const appUrl = process.env.APP_URL || 'http://localhost:3000'
    const reviewUrl = `${appUrl}/reviews/${reviewToken}`

    const customerName = [job.customer.firstName, job.customer.lastName]
      .filter(Boolean)
      .join(' ')

    const channels: string[] = []

    if (job.customer.email) {
      const result = await sendJobCompleteEmail({
        to: job.customer.email,
        customerName,
        orgName: job.organization.name,
        jobTitle: job.title,
        workSummary: job.workSummary ?? undefined,
        outstandingFormatted,
        payUrl,
        reviewUrl,
      })
      if (result.success) channels.push('email')
    }

    if (job.organization.smsEnabled && job.customer.phone) {
      const result = await sendJobCompleteSms({
        to: job.customer.phone,
        customerName,
        orgName: job.organization.name,
        jobTitle: job.title,
        outstandingFormatted,
        payUrl,
        reviewUrl,
      })
      if (result.success) channels.push('sms')
    }

    if (channels.length === 0) {
      return { sent: false, channels: [], skippedReason: 'no_contact_method' }
    }

    await db.job.update({
      where: { id: jobId },
      data: {
        completionNoticeSentAt: new Date(),
        completionNoticeChannels: channels.join(',') || null,
      },
    })

    await trackEvent({
      organizationId,
      eventName: 'job_completion_notice_sent',
      entityType: 'job',
      entityId: jobId,
      metadataJson: { channels, hadOpenInvoice: !!openInvoice },
    })

    return { sent: true, channels }
  } catch (error) {
    console.error('[job-complete-notice] Unexpected error for job', jobId, error)
    return { sent: false, channels: [], skippedReason: 'error' }
  }
}
