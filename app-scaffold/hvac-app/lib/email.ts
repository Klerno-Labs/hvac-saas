import { Resend } from 'resend'
import { renderEmail, escapeHtml } from './email-template'

let _resend: Resend | null = null

function getResend(): Resend | null {
  if (!process.env.RESEND_API_KEY) return null
  if (!_resend) {
    _resend = new Resend(process.env.RESEND_API_KEY)
  }
  return _resend
}

const FROM_EMAIL = process.env.EMAIL_FROM || 'FieldClose <noreply@resend.dev>'

type SendResult = { success: true; id: string } | { success: false; error: string }

export async function sendEmail(params: {
  to: string
  subject: string
  html: string
}): Promise<SendResult> {
  const resend = getResend()
  if (!resend) {
    console.log(`[email-skipped] No RESEND_API_KEY — would send to ${params.to}: ${params.subject}`)
    return { success: false, error: 'Email delivery not configured (RESEND_API_KEY missing)' }
  }

  try {
    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to: params.to,
      subject: params.subject,
      html: params.html,
    })

    if (result.error) {
      console.error('[email-error]', result.error)
      return { success: false, error: result.error.message }
    }

    return { success: true, id: result.data?.id || '' }
  } catch (error) {
    console.error('[email-error]', error)
    return { success: false, error: 'Failed to send email' }
  }
}

export async function sendInvoiceEmail(params: {
  to: string
  customerName: string
  invoiceNumber: string
  totalFormatted: string
  orgName: string
  portalUrl?: string
  dueDate?: string
}): Promise<SendResult> {
  const body = `
    <p>Hi ${params.customerName},</p>
    <p><strong>${params.orgName}</strong> has sent you an invoice for <strong>${params.totalFormatted}</strong>.</p>
    ${params.dueDate ? `<p style="color:#64748b;">Payment due: <strong>${params.dueDate}</strong></p>` : ''}
    <p>You can view and pay this invoice securely online.</p>
  `

  return sendEmail({
    to: params.to,
    subject: `Invoice #${params.invoiceNumber} from ${params.orgName}`,
    html: renderEmail({
      title: `Invoice #${params.invoiceNumber}`,
      preheader: `${params.totalFormatted} invoice from ${params.orgName}`,
      body,
      cta: params.portalUrl ? { label: 'View & Pay Invoice', url: params.portalUrl } : undefined,
      footer: `Questions? Contact ${params.orgName} directly.`,
    }),
  })
}

export async function sendEstimateEmail(params: {
  to: string
  customerName: string
  estimateNumber: string
  totalFormatted: string
  orgName: string
  portalUrl?: string
}): Promise<SendResult> {
  const body = `
    <p>Hi ${params.customerName},</p>
    <p><strong>${params.orgName}</strong> has prepared an estimate for you totaling <strong>${params.totalFormatted}</strong>.</p>
    <p>Review the details and approve it online whenever you're ready.</p>
  `

  return sendEmail({
    to: params.to,
    subject: `Estimate #${params.estimateNumber} from ${params.orgName}`,
    html: renderEmail({
      title: `Estimate #${params.estimateNumber}`,
      preheader: `${params.totalFormatted} estimate from ${params.orgName}`,
      body,
      cta: params.portalUrl ? { label: 'View Estimate', url: params.portalUrl } : undefined,
      footer: `Questions? Contact ${params.orgName} directly.`,
    }),
  })
}

export async function sendCollectionEmail(params: {
  to: string
  customerName: string
  invoiceNumber: string
  totalFormatted: string
  orgName: string
  portalUrl?: string
  dueDate?: string
  stage: 'overdue_1' | 'overdue_2' | 'final_notice'
}): Promise<SendResult> {
  const stageText = {
    overdue_1: { title: 'Friendly Payment Reminder', message: "This is a friendly reminder that your invoice is past due. If you've already paid, please disregard this notice." },
    overdue_2: { title: 'Second Payment Reminder', message: 'Your invoice remains unpaid. Please arrange payment at your earliest convenience to avoid late fees.' },
    final_notice: { title: 'Final Payment Notice', message: 'This is a final notice regarding your overdue invoice. Please arrange payment immediately to avoid further action.' },
  }[params.stage]

  const body = `
    <p>Hi ${params.customerName},</p>
    <p>${stageText.message}</p>
    <p><strong>Invoice #${params.invoiceNumber}</strong> — ${params.totalFormatted}${params.dueDate ? ` (was due ${params.dueDate})` : ''}</p>
  `

  return sendEmail({
    to: params.to,
    subject: `${stageText.title}: Invoice #${params.invoiceNumber} from ${params.orgName}`,
    html: renderEmail({
      title: stageText.title,
      preheader: `Invoice #${params.invoiceNumber} — ${params.totalFormatted} outstanding`,
      body,
      cta: params.portalUrl ? { label: 'Pay Now', url: params.portalUrl } : undefined,
      footer: `Questions? Contact ${params.orgName} directly.`,
    }),
  })
}

export function buildJobCompleteEmailBody(params: {
  customerName: string
  orgName: string
  jobTitle: string
  workSummary?: string
  outstandingFormatted?: string
  payUrl?: string
  reviewUrl?: string
}): string {
  const hasPay = !!(params.outstandingFormatted && params.payUrl)
  return `
    <p>Hi ${escapeHtml(params.customerName)},</p>
    <p>Your <strong>${escapeHtml(params.jobTitle)}</strong> job with <strong>${escapeHtml(params.orgName)}</strong> is complete. Thank you for your business!</p>
    ${params.workSummary ? `<p>${escapeHtml(params.workSummary)}</p>` : ''}
    ${hasPay ? `<p>You have a balance of <strong>${escapeHtml(params.outstandingFormatted!)}</strong>.</p>` : ''}
    ${!hasPay && params.reviewUrl ? `<p>We'd love to hear your feedback — <a href="${params.reviewUrl}" style="color:#0f766e;">leave a review</a>.</p>` : ''}
  `
}

export async function sendJobCompleteEmail(params: {
  to: string
  customerName: string
  orgName: string
  jobTitle: string
  workSummary?: string
  payUrl?: string
  reviewUrl?: string
  outstandingFormatted?: string
}): Promise<SendResult> {
  const hasPay = !!(params.outstandingFormatted && params.payUrl)
  return sendEmail({
    to: params.to,
    subject: `Your ${params.jobTitle} job is complete`,
    html: renderEmail({
      title: `Your ${params.jobTitle} job is complete`,
      preheader: hasPay
        ? `Thank you — you have a balance of ${params.outstandingFormatted}`
        : `Your ${params.jobTitle} job is complete`,
      body: buildJobCompleteEmailBody(params),
      cta: hasPay
        ? { label: 'View & Pay Invoice', url: params.payUrl! }
        : params.reviewUrl
          ? { label: 'Leave a Review', url: params.reviewUrl }
          : undefined,
      footer: `Questions? Contact ${params.orgName} directly.`,
    }),
  })
}

export async function sendPasswordResetEmail(params: {
  to: string
  resetUrl: string
}): Promise<SendResult> {
  const body = `
    <p>We received a request to reset your FieldClose password.</p>
    <p style="color:#64748b;font-size:13px;">This link expires in 1 hour. If you didn't request this, you can safely ignore this email.</p>
  `

  return sendEmail({
    to: params.to,
    subject: 'Reset your FieldClose password',
    html: renderEmail({
      title: 'Reset your password',
      body,
      cta: { label: 'Reset Password', url: params.resetUrl },
    }),
  })
}

export async function sendTeamInviteEmail(params: {
  to: string
  orgName: string
  inviterName: string
  signupUrl: string
}): Promise<SendResult> {
  const body = `
    <p>${params.inviterName} has invited you to join <strong>${params.orgName}</strong> on FieldClose.</p>
    <p>FieldClose helps HVAC teams track jobs, send estimates, invoice customers, and get paid — all in one place.</p>
  `

  return sendEmail({
    to: params.to,
    subject: `You've been invited to ${params.orgName} on FieldClose`,
    html: renderEmail({
      title: `Join ${params.orgName} on FieldClose`,
      preheader: `${params.inviterName} invited you to collaborate`,
      body,
      cta: { label: 'Accept Invitation', url: params.signupUrl },
    }),
  })
}
