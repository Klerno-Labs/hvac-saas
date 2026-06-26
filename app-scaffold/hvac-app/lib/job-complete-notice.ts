import { sendEmail } from '@/lib/email'
import { sendSms, isTwilioConfigured } from '@/lib/sms'
import { renderEmail } from '@/lib/email-template'

export function shouldSendCompletionNotice(prevStatus: string, nextStatus: string): boolean {
  return nextStatus === 'completed' && prevStatus !== 'completed'
}

export function isAuthorized(header: string | null, secret: string): boolean {
  return header === `Bearer ${secret}`
}

export async function sendJobCompleteNotice(jobId: string, organizationId: string): Promise<boolean> {
  const { db } = await import('@/lib/db')

  const job = await db.job.findFirst({
    where: { id: jobId, organizationId },
    select: {
      id: true,
      title: true,
      completionNoticeSentAt: true,
      customer: {
        select: { firstName: true, lastName: true, email: true, phone: true },
      },
      organization: {
        select: { name: true, jobCompletionNoticeEnabled: true, smsEnabled: true },
      },
    },
  })

  if (!job || !job.organization.jobCompletionNoticeEnabled) return false
  if (job.completionNoticeSentAt) return false

  const customer = job.customer
  const org = job.organization
  const customerName = [customer.firstName, customer.lastName].filter(Boolean).join(' ')

  let sent = false

  if (customer.email) {
    const result = await sendEmail({
      to: customer.email,
      subject: `Your job is complete — ${org.name}`,
      html: renderEmail({
        title: 'Job Complete',
        preheader: `Your job "${job.title}" has been completed`,
        body: `<p>Hi ${customerName},</p><p>Your job <strong>${job.title}</strong> has been marked complete by <strong>${org.name}</strong>. Thank you for your business!</p>`,
      }),
    })
    if (result.success) sent = true
  }

  if (!sent && customer.phone && org.smsEnabled && isTwilioConfigured()) {
    const result = await sendSms(
      customer.phone,
      `Hi ${customerName}, your job "${job.title}" has been completed by ${org.name}. Thank you!`
    )
    if (result.success) sent = true
  }

  if (sent) {
    await db.job.update({
      where: { id: jobId },
      data: { completionNoticeSentAt: new Date() },
    })
  }

  return sent
}
