import { db } from '@/lib/db'
import { sendEmail } from '@/lib/email'

export async function sendDunningEmail(orgId: string, attempt: number): Promise<void> {
  let ownerEmail: string | null = null
  let orgName = 'your organization'

  try {
    const org = await db.organization.findUnique({
      where: { id: orgId },
      include: {
        members: {
          where: { role: 'owner' },
          include: { user: { select: { email: true } } },
          take: 1,
        },
      },
    })

    if (!org) {
      console.warn(`[dunning] org ${orgId} not found — skipping email`)
      return
    }

    orgName = org.name
    ownerEmail = org.members[0]?.user?.email ?? null
  } catch (err) {
    console.error('[dunning] failed to look up org for dunning email', err)
    return
  }

  if (!ownerEmail) {
    console.warn(`[dunning] no owner email for org ${orgId} — skipping dunning email`)
    return
  }

  const attemptSuffix = attempt > 1 ? ` (attempt ${attempt})` : ''

  const result = await sendEmail({
    to: ownerEmail,
    subject: `Action required: payment failed for ${orgName}${attemptSuffix}`,
    html: `<p>Your payment for the <strong>${orgName}</strong> FieldClose subscription has failed${attemptSuffix}. Please update your payment method to avoid service interruption.</p>`,
  })

  if (!result.success) {
    console.warn(`[dunning] email delivery failed for org ${orgId}: ${result.error}`)
  }
}
