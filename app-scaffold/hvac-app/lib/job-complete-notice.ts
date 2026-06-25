import { db } from '@/lib/db'
import { sendEmail } from '@/lib/email'
import { renderEmail } from '@/lib/email-template'
import { sendSms } from '@/lib/sms'

export function shouldSendCompletionNotice(prevStatus: string, nextStatus: string): boolean {
  return nextStatus === 'completed' && prevStatus !== 'completed'
}

export async function sendJobCompleteNotice(
  jobId: string,
  organizationId: string
): Promise<{ sent: boolean }> {
  const job = await db.job.findFirst({
    where: { id: jobId, organizationId },
    include: {
      organization: {
        select: { name: true, jobCompletionNoticeEnabled: true, smsEnabled: true },
      },
      customer: {
        select: { firstName: true, lastName: true, email: true, phone: true },
      },
    },
  })

  if (!job) return { sent: false }
  if (job.completionNoticeSentAt) return { sent: false }
  if (!job.organization.jobCompletionNoticeEnabled) return { sent: false }

  const { organization, customer } = job
  const customerName = [customer.firstName, customer.lastName].filter(Boolean).join(' ')

  let dispatched = false

  if (customer.email) {
    const body = `
      <p>Hi ${customerName},</p>
      <p><strong>${organization.name}</strong> has completed your service job.</p>
      ${job.completionNotes ? `<p>Technician notes: ${job.completionNotes}</p>` : ''}
    `
    const result = await sendEmail({
      to: customer.email,
      subject: `Service complete — ${organization.name}`,
      html: renderEmail({
        title: 'Your service is complete',
        preheader: `${organization.name} has completed your service`,
        body,
        footer: `Thank you for choosing ${organization.name}.`,
      }),
    })
    if (result.success) dispatched = true
  } else if (customer.phone && organization.smsEnabled) {
    const result = await sendSms(
      customer.phone,
      `Hi ${customerName}, ${organization.name} has completed your service job. Thank you!`
    )
    if (result.success) dispatched = true
  }

  if (dispatched) {
    await db.job.update({
      where: { id: jobId },
      data: { completionNoticeSentAt: new Date() },
    })
  }

  return { sent: dispatched }
}
