'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { trackEvent } from '@/lib/events'
import { logAudit } from '@/lib/audit'
import { updateInvoiceSchema, updateInvoiceStatusSchema } from '@/lib/validations/invoice'
import { getOrCreatePortalUrl } from '@/lib/portal'
import { sendInvoiceEmail } from '@/lib/email'
import { assertCanWrite, handleGuardError } from '@/lib/billing-guard'

type ActionResult =
  | { success: true }
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
  const session = await auth()
  if (!session?.user?.id) {
    return { success: false, error: 'You must be logged in' }
  }

  const userId = session.user.id

  const membership = await db.organizationMember.findFirst({
    where: { userId },
  })
  if (!membership) {
    return { success: false, error: 'You must belong to an organization' }
  }

  const organizationId = membership.organizationId

  try {
    await assertCanWrite(organizationId)
  } catch (e) {
    const guard = handleGuardError(e)
    if (guard) return guard
    throw e
  }

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
      where: { id: invoiceId },
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

  return { success: true }
}

export async function updateInvoiceStatus(
  invoiceId: string,
  formData: FormData,
): Promise<ActionResult> {
  const session = await auth()
  if (!session?.user?.id) {
    return { success: false, error: 'You must be logged in' }
  }

  const userId = session.user.id

  const membership = await db.organizationMember.findFirst({
    where: { userId },
  })
  if (!membership) {
    return { success: false, error: 'You must belong to an organization' }
  }

  const organizationId = membership.organizationId

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

  await db.invoice.update({
    where: { id: invoiceId },
    data: {
      status,
      sentAt: status === 'sent' && !invoice.sentAt ? new Date() : invoice.sentAt,
      paidAt: status === 'paid' && !invoice.paidAt ? new Date() : invoice.paidAt,
      outstandingCents: status === 'paid' ? 0 : status === 'void' ? 0 : invoice.outstandingCents,
      // Clear stale checkout session when voiding so customers can't pay a voided invoice
      stripeCheckoutSessionId: status === 'void' ? null : invoice.stripeCheckoutSessionId,
    },
  })

  // Send email when marking as sent
  const customerEmail = invoice.customer.email
  if (status === 'sent' && customerEmail) {
    const customer = invoice.customer
    const org = await db.organization.findUniqueOrThrow({ where: { id: organizationId } })
    const portalUrl = await getOrCreatePortalUrl(organizationId, customer.id)

    await sendInvoiceEmail({
      to: customerEmail,
      customerName: [customer.firstName, customer.lastName].filter(Boolean).join(' '),
      invoiceNumber: invoice.invoiceNumber,
      totalFormatted: '$' + (invoice.totalCents / 100).toFixed(2),
      orgName: org.name,
      portalUrl,
      dueDate: invoice.dueDate ? invoice.dueDate.toLocaleDateString() : undefined,
    })
  }

  await trackEvent({
    organizationId,
    userId,
    eventName: 'invoice_status_updated',
    entityType: 'invoice',
    entityId: invoiceId,
    metadataJson: { from: invoice.status, to: status },
  })

  // Audit log for high-impact status changes
  if (status === 'void' || status === 'paid') {
    await logAudit({
      organizationId,
      actorId: userId,
      eventType: `invoice_${status}`,
      targetType: 'invoice',
      targetId: invoiceId,
      metadata: { from: invoice.status, to: status, invoiceNumber: invoice.invoiceNumber },
    })
  }

  return { success: true }
}
