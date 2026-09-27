'use server'

import { formatDateOnly } from '@/lib/format'
import { getStripe } from '@/lib/stripe'
import { requireMutationAccess } from '@/lib/mutation-access'
import { db } from '@/lib/db'
import { trackEvent } from '@/lib/events'
import { logAudit } from '@/lib/audit'
import { summarizeInvoicePriceChange } from './price-diff'
import { updateInvoiceSchema, updateInvoiceStatusSchema } from '@/lib/validations/invoice'
import { getOrCreatePortalUrl } from '@/lib/portal'
import { sendInvoiceEmail } from '@/lib/email'

type ActionResult =
  | { success: true; warning?: string }
  | { success: false; error: string }

export async function updateInvoice(
  invoiceId: string,
  input: {
    descriptionOfWork: string
    notes?: string
    taxCents: number
    dueDate?: string
    lineItems: { name: string; description?: string; quantity: number; unitPriceCents: number }[]
  },
): Promise<ActionResult> {
  const access = await requireMutationAccess('editPricing')
  if (!access.authorized) return { success: false, error: access.error }
  const { session, userId, organizationId } = access.context


  const invoice = await db.invoice.findFirst({
    where: { id: invoiceId, organizationId },
  })
  if (!invoice) {
    return { success: false, error: 'Invoice not found in your organization' }
  }

  if (invoice.status !== 'draft') {
    return { success: false, error: 'Only draft invoices can be edited' }
  }

  const parsed = updateInvoiceSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0].message }
  }

  const data = parsed.data

  const beforeSnapshot = {
    subtotalCents: invoice.subtotalCents,
    taxCents: invoice.taxCents,
    totalCents: invoice.totalCents,
  }

  const lineItemsWithTotals = data.lineItems.map((item, index) => ({
    name: item.name,
    description: item.description || null,
    quantity: item.quantity,
    unitPriceCents: item.unitPriceCents,
    lineTotalCents: item.quantity * item.unitPriceCents,
    sortOrder: index,
  }))

  const subtotalCents = lineItemsWithTotals.reduce((sum, li) => sum + li.lineTotalCents, 0)
  const taxCents = data.taxCents
  const totalCents = subtotalCents + taxCents

  await db.$transaction(async (tx) => {
    await tx.invoiceLineItem.deleteMany({ where: { invoiceId } })
    await tx.invoice.update({
      where: { id: invoiceId, organizationId, status: 'draft' },
      data: {
        descriptionOfWork: data.descriptionOfWork,
        notes: data.notes || null,
        subtotalCents,
        taxCents,
        totalCents,
        outstandingCents: totalCents,
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        lineItems: { create: lineItemsWithTotals },
      },
    })
  })

  await trackEvent({
    organizationId,
    userId,
    eventName: 'invoice_updated',
    entityType: 'invoice',
    entityId: invoiceId,
  })

  try {
    const priceDiff = summarizeInvoicePriceChange(beforeSnapshot, { subtotalCents, taxCents, totalCents })
    await logAudit({
      organizationId,
      actorId: userId,
      actorEmail: session.user.email ?? undefined,
      eventType: 'invoice.priced',
      targetType: 'invoice',
      targetId: invoiceId,
      metadata: { ...(priceDiff ?? {}), invoiceId },
    })
  } catch { /* best-effort */ }

  return { success: true }
}

export async function updateInvoiceStatus(
  invoiceId: string,
  formData: FormData,
): Promise<ActionResult> {
  const access = await requireMutationAccess('editPricing')
  if (!access.authorized) return { success: false, error: access.error }
  const { session, userId, organizationId } = access.context


  const invoice = await db.invoice.findFirst({
    where: { id: invoiceId, organizationId },
    include: { customer: true },
  })
  if (!invoice) {
    return { success: false, error: 'Invoice not found in your organization' }
  }

  const parsed = updateInvoiceStatusSchema.safeParse({ status: formData.get('status') })
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0].message }
  }

  const { status } = parsed.data

  if (status === 'paid') return {success: false, error: 'Payment status is confirmed by the payment provider'}
  const allowed: Record<string, string[]> = {draft: ['sent', 'void'], sent: ['sent', 'overdue', 'void'], overdue: ['sent', 'void']}
  if (!allowed[invoice.status]?.includes(status)) return {success: false, error: 'This invoice status cannot be changed in that way'}
  // Expire the hosted checkout before voiding; clearing its ID alone leaves a
  // chargeable link in customers' inboxes.
  if (status === 'void' && invoice.stripeCheckoutSessionId) {
    const org = await db.organization.findUnique({where: {id: organizationId}})
    if (!org?.stripeConnectedAccountId) return {success: false, error: 'Payment settings must be restored before this invoice can be voided'}
    try {
      const stripe = getStripe()
      const checkout = await stripe.checkout.sessions.retrieve(invoice.stripeCheckoutSessionId, {stripeAccount: org.stripeConnectedAccountId})
      if (checkout.status === 'complete') return {success: false, error: 'A payment is processing. Wait for confirmation before changing this invoice'}
      if (checkout.status === 'open') await stripe.checkout.sessions.expire(checkout.id, {stripeAccount: org.stripeConnectedAccountId})
    } catch {
      return {success: false, error: 'Could not close the payment link. Please try again before voiding this invoice'}
    }
  }

  const changed = await db.invoice.updateMany({
    where: { id: invoiceId, organizationId, status: invoice.status, updatedAt: invoice.updatedAt },
    data: {
      status,
      sentAt: status === 'sent' && !invoice.sentAt ? new Date() : invoice.sentAt,
      outstandingCents: status === 'void' ? 0 : invoice.outstandingCents,
      // Clear stale checkout session when voiding so customers can't pay a voided invoice
      stripeCheckoutSessionId: status === 'void' ? null : invoice.stripeCheckoutSessionId,
    },
  })

  if (changed.count !== 1) return {success: false, error: 'This invoice changed. Refresh and try again'}

  // Status and customer delivery are distinct outcomes. Never report an
  // email as sent when the delivery provider rejected it or is unavailable.
  let warning: string | undefined
  const unconfirmedDelivery = 'The invoice is marked sent, but email submission could not be confirmed. Check email delivery status and the recipient\'s inbox before retrying to avoid sending it twice.'
  if (status === 'sent') {
    const customer = invoice.customer
    if (!customer.email) {
      warning = 'The invoice is marked sent, but no email was sent because this customer has no email address. Add an email address, then choose Sent again to send it.'
    } else {
      let emailAttempted = false
      try {
        const org = await db.organization.findUniqueOrThrow({ where: { id: organizationId } })
        const portalUrl = await getOrCreatePortalUrl(organizationId, customer.id)
        emailAttempted = true
        const delivery = await sendInvoiceEmail({
          to: customer.email,
          customerName: [customer.firstName, customer.lastName].filter(Boolean).join(' '),
          invoiceNumber: invoice.invoiceNumber,
          totalFormatted: '$' + (invoice.totalCents / 100).toFixed(2),
          orgName: org.name,
          portalUrl,
          dueDate: invoice.dueDate ? formatDateOnly(invoice.dueDate) : undefined,
        })
        if (!delivery.success) warning = delivery.retryable === true
          ? 'The invoice is marked sent, but its email could not be delivered. Check email delivery settings, then choose Sent again to retry.'
          : unconfirmedDelivery
      } catch {
        console.error('Invoice delivery failed after status update')
        warning = emailAttempted ? unconfirmedDelivery : 'The invoice is marked sent, but its email could not be delivered. Check email delivery settings, then choose Sent again to retry.'
      }
    }
  }

  try {
    await trackEvent({
      organizationId,
      userId,
      eventName: 'invoice_status_updated',
      entityType: 'invoice',
      entityId: invoiceId,
      metadataJson: { from: invoice.status, to: status },
    })
  } catch {
    // A telemetry outage must not turn an already submitted email into a
    // failed action that encourages the user to send it again.
    console.error('Invoice status activity could not be recorded')
  }

  // Audit log for high-impact status changes
  if (status === 'void') {
    await logAudit({
      organizationId,
      actorId: userId,
      eventType: `invoice_${status}`,
      targetType: 'invoice',
      targetId: invoiceId,
      metadata: { from: invoice.status, to: status, invoiceNumber: invoice.invoiceNumber },
    })
  }

  return { success: true, ...(warning ? { warning } : {}) }
}
