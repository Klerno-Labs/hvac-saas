import { db } from '@/lib/db'
import { sendEmail } from '@/lib/email'
import { renderEmail } from '@/lib/email-template'
import { trackEvent } from '@/lib/events'
import { getOrCreatePortalUrl } from '@/lib/portal'
import { sendSms } from '@/lib/sms'
import { getOrCreateReviewTokenForJob } from '@/lib/reviews'

/**
 * Job-complete lifecycle notification.
 *
 * Fires when a job transitions into `completed` (from either the status
 * dropdown or the proof-of-work form). Sends the customer an email and SMS
 * with a work summary, a link to pay any open invoice, and a review link.
 *
 * Idempotency: an atomic claim on `Job.completionNoticeSentAt` guarantees
 * the customer receives at most one completion notice per job, even if the
 * job is flipped in and out of `completed` repeatedly or two requests race.
 */

export type JobCompletionMessageContext = {
  customerName: string
  orgName: string
  jobTitle: string
  workSummary?: string | null
  technicianName?: string | null
  hasOpenInvoice: boolean
  outstandingFormatted?: string
  payUrl?: string
  reviewUrl?: string
}

export function formatCents(cents: number): string {
  return '$' + (cents / 100).toFixed(2)
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string
  ))
}

/**
 * Build the customer-facing completion email. Pure/deterministic — no DB,
 * no network — so it can be unit tested directly.
 */
export function buildJobCompletionEmail(ctx: JobCompletionMessageContext): {
  subject: string
  preheader: string
  html: string
} {
  const subject = `Job complete: ${ctx.jobTitle} — ${ctx.orgName}`
  const preheader = ctx.hasOpenInvoice
    ? `${ctx.orgName} completed your service — ${ctx.outstandingFormatted} due`
    : `${ctx.orgName} completed your service`

  const greeting = `<p>Hi ${escapeHtml(ctx.customerName)},</p>`
  const intro = `<p>Your service with <strong>${escapeHtml(ctx.orgName)}</strong> is complete. Thank you for choosing us!</p>`

  const blocks: string[] = [greeting, intro]

  if (ctx.workSummary && ctx.workSummary.trim()) {
    blocks.push(
      `<p style="margin-top:16px;"><strong>Work completed:</strong><br><span style="white-space:pre-wrap;">${escapeHtml(ctx.workSummary.trim())}</span></p>`,
    )
  }

  if (ctx.technicianName && ctx.technicianName.trim()) {
    blocks.push(`<p>Completed by ${escapeHtml(ctx.technicianName.trim())}.</p>`)
  }

  if (ctx.hasOpenInvoice && ctx.payUrl && ctx.outstandingFormatted) {
    blocks.push(
      `<p style="margin-top:16px;">You have a balance of <strong>${escapeHtml(ctx.outstandingFormatted)}</strong> due. Pay securely online anytime:<br><a href="${escapeHtml(ctx.payUrl)}">${escapeHtml(ctx.payUrl)}</a></p>`,
    )
  }

  if (ctx.reviewUrl) {
    blocks.push(
      `<p style="margin-top:16px;">We'd love your feedback — it only takes a minute:<br><a href="${escapeHtml(ctx.reviewUrl)}">${escapeHtml(ctx.reviewUrl)}</a></p>`,
    )
  }

  // Primary CTA: pay if there is an open balance, otherwise the review link.
  const cta =
    ctx.hasOpenInvoice && ctx.payUrl
      ? { label: 'View & Pay Invoice', url: ctx.payUrl }
      : ctx.reviewUrl
        ? { label: 'Leave a Review', url: ctx.reviewUrl }
        : undefined

  const html = renderEmail({
    title: 'Your service is complete',
    preheader,
    body: blocks.join('\n'),
    cta,
    footer: `Questions? Contact ${ctx.orgName} directly.`,
  })

  return { subject, preheader, html }
}

/**
 * Build the customer-facing completion SMS. Pure/deterministic.
 */
export function buildJobCompletionSms(ctx: JobCompletionMessageContext): string {
  const parts: string[] = []
  const title = ctx.jobTitle ? ` (${ctx.jobTitle})` : ''
  parts.push(`Hi ${ctx.customerName}, ${ctx.orgName} has completed your service${title}.`)

  if (ctx.hasOpenInvoice && ctx.payUrl && ctx.outstandingFormatted) {
    parts.push(`Balance due: ${ctx.outstandingFormatted}. Pay: ${ctx.payUrl}`)
  }
  if (ctx.reviewUrl) {
    parts.push(`Leave a review: ${ctx.reviewUrl}`)
  }

  parts.push('Thanks for choosing us!')
  return parts.join(' ')
}

export type SendCompletionNoticeResult = {
  sent: boolean
  alreadySent: boolean
  emailSent: boolean
  smsSent: boolean
  skipped: string[]
}

/**
 * Send the job-complete notice to the customer, if it hasn't been sent yet.
 * Best-effort: notification failures never raise to the caller (the job
 * status update must always succeed). SMS is gated on `organization.smsEnabled`
 * to match the collections automation contract.
 */
export async function sendJobCompletionNotice(input: {
  organizationId: string
  jobId: string
  actorId?: string
}): Promise<SendCompletionNoticeResult> {
  const notSent: SendCompletionNoticeResult = {
    sent: false,
    alreadySent: false,
    emailSent: false,
    smsSent: false,
    skipped: [],
  }

  const job = await db.job.findFirst({
    where: { id: input.jobId, organizationId: input.organizationId },
    include: {
      customer: true,
      organization: { select: { name: true, smsEnabled: true } },
      invoices: {
        // "Open" = issued and unpaid: not draft, not paid, not void, with a balance.
        where: {
          status: { notIn: ['paid', 'void', 'draft'] },
          outstandingCents: { gt: 0 },
        },
        orderBy: { createdAt: 'desc' },
      },
    },
  })

  if (!job) {
    return { ...notSent, skipped: ['job_not_found'] }
  }

  // Atomic claim: only one concurrent/sequential caller wins the send slot.
  const now = new Date()
  const claim = await db.job.updateMany({
    where: { id: job.id, completionNoticeSentAt: null },
    data: { completionNoticeSentAt: now },
  })
  if (claim.count === 0) {
    return { ...notSent, alreadySent: true, skipped: ['already_sent'] }
  }

  const customerName =
    [job.customer.firstName, job.customer.lastName].filter(Boolean).join(' ') || 'there'
  const outstandingCents = job.invoices.reduce((sum, inv) => sum + inv.outstandingCents, 0)
  const hasOpenInvoice = outstandingCents > 0

  const payUrl = hasOpenInvoice
    ? await getOrCreatePortalUrl(job.organizationId, job.customer.id)
    : undefined
  const { url: reviewUrl } = await getOrCreateReviewTokenForJob(
    job.id,
    job.organizationId,
    job.customer.id,
  )

  const ctx: JobCompletionMessageContext = {
    customerName,
    orgName: job.organization.name,
    jobTitle: job.title,
    workSummary: job.workSummary,
    technicianName: job.technicianName,
    hasOpenInvoice,
    outstandingFormatted: hasOpenInvoice ? formatCents(outstandingCents) : undefined,
    payUrl,
    reviewUrl,
  }

  const skipped: string[] = []
  let emailSent = false
  let smsSent = false

  if (job.customer.email) {
    const { subject, html } = buildJobCompletionEmail(ctx)
    const res = await sendEmail({ to: job.customer.email, subject, html })
    emailSent = res.success
    if (!res.success) skipped.push(`email:${res.error}`)
  } else {
    skipped.push('email:no_customer_email')
  }

  if (job.organization.smsEnabled && job.customer.phone) {
    const res = await sendSms(job.customer.phone, buildJobCompletionSms(ctx))
    smsSent = res.success
    if (!res.success) skipped.push(`sms:${res.error}`)
  } else if (!job.organization.smsEnabled) {
    skipped.push('sms:org_disabled')
  } else {
    skipped.push('sms:no_customer_phone')
  }

  await trackEvent({
    organizationId: job.organizationId,
    userId: input.actorId,
    eventName: 'job_completion_notice_sent',
    entityType: 'job',
    entityId: job.id,
    metadataJson: { emailSent, smsSent, hasOpenInvoice, outstandingCents },
  })

  return {
    sent: emailSent || smsSent,
    alreadySent: false,
    emailSent,
    smsSent,
    skipped,
  }
}
