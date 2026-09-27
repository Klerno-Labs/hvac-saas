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
import { claimInvoicePaymentAttemptForCancellation, hasActiveInvoicePaymentAttempt, releaseInvoicePaymentLease, retireInvoicePaymentAttempt, type InvoicePaymentAttempt } from '@/lib/invoice-payment-attempt'
import type Stripe from 'stripe'
import type { Invoice, Prisma } from '@prisma/client'

type ActionResult =
  | { success: true; warning?: string }
  | { success: false; error: string }

async function checkVoidUnderLock(tx: Prisma.TransactionClient, invoice: Invoice, organizationId: string): Promise<ActionResult> {
  await tx.$queryRaw`SELECT id FROM "Invoice" WHERE id = ${invoice.id} AND "organizationId" = ${organizationId} FOR UPDATE`
  const current = await tx.invoice.findFirst({ where: { id: invoice.id, organizationId } })
  if (!current || current.status !== invoice.status || current.updatedAt.getTime() !== invoice.updatedAt.getTime() ||
      current.stripeCheckoutSessionId !== invoice.stripeCheckoutSessionId) {
    return { success: false, error: 'This invoice changed. Refresh and try again' }
  }
  if (await hasActiveInvoicePaymentAttempt(tx, invoice.id, organizationId) ||
      await tx.payment.findFirst({ where: { invoiceId: invoice.id, organizationId, status: 'pending' }, select: { id: true } })) {
    return { success: false, error: 'A payment is being prepared or its outcome is still pending. Confirm or cancel it before voiding this invoice.' }
  }
  return { success: true }
}

function matchesCheckout(checkout: Stripe.Checkout.Session, id: string, invoice: Invoice, amountCents: number) {
  return checkout.id === id && checkout.mode === 'payment' && checkout.currency === 'usd' &&
    checkout.amount_total === amountCents && checkout.metadata?.invoiceId === invoice.id &&
    checkout.metadata.organizationId === invoice.organizationId
}

async function voidInvoice(invoice: Invoice, organizationId: string, userId: string): Promise<ActionResult> {
  let attempt: InvoicePaymentAttempt | null = null
  try {
    let expected = invoice
    if (invoice.status !== 'draft') {
      // Claim only a known Checkout. Terminal, in-flight, and unknown attempts
      // remain blocked; no new payment is created by a status change.
      const claim = await claimInvoicePaymentAttemptForCancellation({ invoiceId: invoice.id, organizationId })
      if (!claim.success) return claim
      attempt = claim.attempt
    }
    if (!attempt) {
      const preflight = await db.$transaction(tx => checkVoidUnderLock(tx, expected, organizationId))
      if (!preflight.success) return preflight
    }

    const checkoutId = attempt?.providerId ?? invoice.stripeCheckoutSessionId
    if (checkoutId) {
      const org = await db.organization.findUnique({ where: { id: organizationId } })
      const account = attempt?.connectedAccountId ?? org?.stripeConnectedAccountId
      if (!account) return { success: false, error: 'Payment settings must be restored before this invoice can be voided' }
      if (attempt && (attempt.amountCents !== invoice.outstandingCents ||
          (invoice.stripeCheckoutSessionId && invoice.stripeCheckoutSessionId !== checkoutId))) {
        return { success: false, error: 'The previous payment does not match this invoice. Review it before voiding.' }
      }
      const stripe = getStripe()
      const options = { stripeAccount: account, timeout: 10_000, maxNetworkRetries: 0 }
      let checkout = await stripe.checkout.sessions.retrieve(checkoutId, options)
      const amountCents = attempt?.amountCents ?? invoice.outstandingCents
      if (!matchesCheckout(checkout, checkoutId, invoice, amountCents)) {
        return { success: false, error: 'The previous payment does not match this invoice. Review it before voiding.' }
      }
      if (checkout.status === 'complete' || checkout.payment_status !== 'unpaid') {
        return { success: false, error: 'A payment is processing. Wait for confirmation before changing this invoice' }
      }
      if (checkout.status === 'open') checkout = await stripe.checkout.sessions.expire(checkoutId, options)
      if (!matchesCheckout(checkout, checkoutId, invoice, amountCents) || checkout.status !== 'expired' || checkout.payment_status !== 'unpaid') {
        return { success: false, error: 'The payment link could not be confirmed closed. Check payment status before voiding this invoice.' }
      }
      if (attempt) {
        const paymentIntentId = typeof checkout.payment_intent === 'string' ? checkout.payment_intent : checkout.payment_intent?.id ?? null
        if (!await retireInvoicePaymentAttempt(attempt, { paymentIntentId })) {
          return { success: false, error: 'The payment changed while closing its link. Refresh before voiding this invoice.' }
        }
        // Retirement clears the saved session and advances updatedAt. Adopt only
        // that change; a payment/status/balance change still prevents voiding.
        const refreshed = await db.invoice.findFirst({ where: { id: invoice.id, organizationId } })
        if (!refreshed || refreshed.status !== invoice.status || refreshed.totalCents !== invoice.totalCents ||
            refreshed.outstandingCents !== invoice.outstandingCents || refreshed.stripeCheckoutSessionId !== null) {
          return { success: false, error: 'This invoice changed. Refresh and try again' }
        }
        expected = refreshed
      }
    }

    return await db.$transaction(async tx => {
      // Same lock as reservation and capture: recheck after external calls so a
      // new payment cannot slip between this decision and the status update.
      const safe = await checkVoidUnderLock(tx, expected, organizationId)
      if (!safe.success) return safe
      const changed = await tx.invoice.updateMany({
        where: { id: invoice.id, organizationId, status: expected.status, updatedAt: expected.updatedAt },
        data: { status: 'void', outstandingCents: 0, stripeCheckoutSessionId: null },
      })
      if (changed.count !== 1) return { success: false, error: 'This invoice changed. Refresh and try again' }
      await logAudit({ organizationId, actorId: userId, eventType: 'invoice_void', targetType: 'invoice', targetId: invoice.id,
        metadata: { from: invoice.status, to: 'void', invoiceNumber: invoice.invoiceNumber } }, tx)
      return { success: true }
    })
  } catch {
    return { success: false, error: 'Voiding could not be confirmed. Refresh the invoice before trying again.' }
  } finally {
    // Retired attempts ignore this. Failed or uncertain cancellations keep their
    // active reservation but allow an explicit retry to check provider status.
    if (attempt) await releaseInvoicePaymentLease(attempt)
  }
}

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
  if (status === 'void') {
    const result = await voidInvoice(invoice, organizationId, userId)
    if (!result.success) return result
  } else {
    const changed = await db.invoice.updateMany({
    where: { id: invoiceId, organizationId, status: invoice.status, updatedAt: invoice.updatedAt },
    data: {
      status,
      sentAt: status === 'sent' && !invoice.sentAt ? new Date() : invoice.sentAt,
    },
  })

    if (changed.count !== 1) return {success: false, error: 'This invoice changed. Refresh and try again'}
  }

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
          outstandingCents: invoice.outstandingCents,
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

  return { success: true, ...(warning ? { warning } : {}) }
}
