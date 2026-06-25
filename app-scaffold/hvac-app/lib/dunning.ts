import { db } from '@/lib/db'
import { sendEmail } from '@/lib/email'
import { renderEmail } from '@/lib/email-template'

/**
 * Dunning for platform-subscription payment failures.
 *
 * Server-only. Triggered by the billing webhook on `invoice.payment_failed`.
 *
 * Idempotency: one email per failed invoice. `dunningLastSentInvoiceId` on the
 * org gates re-sends so a redelivered webhook (or Stripe Smart Retry firing a
 * second `payment_failed` for the same invoice in the same period) never
 * double-sends. The counter resets on `invoice.payment_succeeded`.
 *
 * Degrade-and-alert: `sendEmail` is a no-op-with-log when RESEND_API_KEY is
 * unset, so a missing email provider never crashes the webhook. Email send is
 * system-billing (the org's own payment failed), so it needs no per-message
 * human approval.
 */

export type SendDunningResult =
  | { sent: true; attempt: number }
  | { sent: false; reason: 'org-not-found' | 'no-billing-email' | 'already-sent-for-invoice' | 'send-failed' }

export async function sendDunningEmail(input: {
  orgId: string
  invoiceId: string
  attempt?: number
}): Promise<SendDunningResult> {
  const org = await db.organization.findUnique({
    where: { id: input.orgId },
    select: {
      id: true,
      name: true,
      email: true,
      dunningLastSentInvoiceId: true,
      dunningAttempt: true,
    },
  })
  if (!org) return { sent: false, reason: 'org-not-found' }
  if (!org.email) return { sent: false, reason: 'no-billing-email' }

  // Per-invoice idempotency: a replayed webhook for the same invoice must not
  // send again. (Event-level idempotency is handled by the webhook via
  // WebhookEvent; this is the message-level guard.)
  if (org.dunningLastSentInvoiceId === input.invoiceId) {
    return { sent: false, reason: 'already-sent-for-invoice' }
  }

  const nextAttempt = input.attempt ?? org.dunningAttempt + 1
  const appUrl = process.env.APP_URL || 'http://localhost:3000'
  const portalUrl = `${appUrl}/settings/billing`

  const subject =
    nextAttempt > 1
      ? `Action needed: payment failed (attempt ${nextAttempt})`
      : 'Action needed: your FieldClose subscription payment failed'

  const body = `
    <p>Hi ${org.name} team,</p>
    <p>We couldn't process the payment for your FieldClose subscription${nextAttempt > 1 ? ` (attempt ${nextAttempt})` : ''}.</p>
    <p>No action has been taken on your account yet, but please update your payment method to avoid an interruption in service.</p>
    <p style="color:#64748b;font-size:13px;">If you've already updated your payment method, you can disregard this email — we'll retry automatically.</p>
  `

  const result = await sendEmail({ to: org.email, subject, html: renderEmail({ title: subject, preheader: 'Update your payment method', body, cta: { label: 'Update Payment Method', url: portalUrl } }) })

  if (!result.success) {
    return { sent: false, reason: 'send-failed' }
  }

  // Record the send AFTER success so a transient Resend failure allows a retry
  // on the next webhook delivery. We do NOT throw on the update failure; the
  // email already went out and we don't want to crash the webhook.
  await db.organization
    .update({
      where: { id: org.id },
      data: {
        dunningLastSentInvoiceId: input.invoiceId,
        dunningAttempt: nextAttempt,
        dunningLastSentAt: new Date(),
      },
    })
    .catch((err) => {
      console.error('[dunning] failed to record send — email was sent but idempotency marker not persisted', err)
    })

  return { sent: true, attempt: nextAttempt }
}

/**
 * Clear dunning state after a successful payment. Called by the webhook on
 * `invoice.payment_succeeded`. Resets the attempt counter so the next failed
 * invoice starts fresh.
 */
export async function clearDunningState(orgId: string): Promise<void> {
  await db.organization.update({
    where: { id: orgId },
    data: {
      dunningLastSentInvoiceId: null,
      dunningAttempt: 0,
      dunningLastSentAt: null,
    },
  })
}
