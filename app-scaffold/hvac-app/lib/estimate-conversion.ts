import { db } from '@/lib/db'
import { nextDocumentNumber } from '@/lib/document-number'
import { trackEvent } from '@/lib/events'
import { logAudit } from '@/lib/audit'
import { createInvoiceSchema } from '@/lib/validations/invoice'

export class EstimateConversionError extends Error {}

/** The caller must derive organizationId and actor identity from an authorized session. */
export async function convertAcceptedEstimate(input: {
  estimateId: string
  organizationId: string
  userId: string
  actorEmail?: string
}) {
  const { estimateId, organizationId, userId, actorEmail } = input

  return db.$transaction(async tx => {
    // Match normal invoice creation's lock ordering. Concurrent clicks, retries,
    // and other invoice creation paths all allocate document numbers safely.
    const organization = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "Organization" WHERE id = ${organizationId} FOR UPDATE`
    if (organization.length !== 1) throw new EstimateConversionError('Organization not found')
    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "Estimate" WHERE id = ${estimateId} AND "organizationId" = ${organizationId} FOR UPDATE`
    if (locked.length !== 1) throw new EstimateConversionError('Estimate not found in your organization')

    const estimate = await tx.estimate.findFirst({
      where: { id: estimateId, organizationId },
      include: { job: { include: { customer: true } }, lineItems: { orderBy: { sortOrder: 'asc' } }, payments: true, invoice: true },
    })
    if (!estimate) throw new EstimateConversionError('Estimate not found in your organization')
    if (estimate.job.organizationId !== organizationId || estimate.job.customer.organizationId !== organizationId) {
      throw new EstimateConversionError('The estimate has an invalid customer or job link. Contact support before invoicing.')
    }
    if (estimate.invoice) {
      if (estimate.invoice.organizationId !== organizationId) throw new EstimateConversionError('The linked invoice could not be verified')
      return { invoiceId: estimate.invoice.id, created: false }
    }
    if (estimate.status !== 'accepted') throw new EstimateConversionError('Accept the estimate before creating its invoice')

    // Deposits need explicit credit reconciliation. Never silently invoice the
    // full approved amount when money has already been collected or is pending.
    if (estimate.depositPaidAt || !['none', 'unpaid'].includes(estimate.depositStatus) || estimate.payments.some(payment => ['pending', 'succeeded'].includes(payment.status))) {
      throw new EstimateConversionError('This estimate has a deposit or payment to reconcile. Contact support before creating its invoice so the customer is not charged twice.')
    }

    const parsed = createInvoiceSchema.safeParse({
      jobId: estimate.jobId,
      descriptionOfWork: estimate.scopeOfWork ?? '',
      notes: estimate.notes ?? '',
      taxCents: estimate.taxCents,
      lineItems: estimate.lineItems.map(item => ({ name: item.name, description: item.description ?? '', quantity: item.quantity, unitPriceCents: item.unitPriceCents })),
    })
    if (!parsed.success) throw new EstimateConversionError('The approved estimate contains invalid amounts or line items. Contact support before creating its invoice.')
    const subtotalCents = estimate.lineItems.reduce((sum, item) => sum + item.quantity * item.unitPriceCents, 0)
    if (estimate.lineItems.some(item => item.lineTotalCents !== item.quantity * item.unitPriceCents) || subtotalCents !== estimate.subtotalCents || subtotalCents + estimate.taxCents !== estimate.totalCents) {
      throw new EstimateConversionError('The approved estimate totals do not match its line items. Contact support before creating its invoice.')
    }

    const invoiceNumber = await nextDocumentNumber(tx, organizationId, 'invoice')
    const invoice = await tx.invoice.create({ data: {
      organizationId,
      jobId: estimate.jobId,
      customerId: estimate.job.customerId,
      sourceEstimateId: estimate.id,
      invoiceNumber,
      status: 'draft',
      descriptionOfWork: estimate.scopeOfWork,
      notes: estimate.notes,
      subtotalCents: estimate.subtotalCents,
      taxCents: estimate.taxCents,
      totalCents: estimate.totalCents,
      outstandingCents: estimate.totalCents,
      lineItems: { create: estimate.lineItems.map(item => ({
        name: item.name, description: item.description, quantity: item.quantity,
        unitPriceCents: item.unitPriceCents, lineTotalCents: item.lineTotalCents, sortOrder: item.sortOrder,
      })) },
    } })
    await trackEvent({ organizationId, userId, eventName: 'invoice_created', entityType: 'invoice', entityId: invoice.id, metadataJson: { sourceEstimateId: estimateId } }, tx)
    await logAudit({ organizationId, actorId: userId, actorEmail, eventType: 'estimate.converted_to_invoice', targetType: 'estimate', targetId: estimateId, metadata: { invoiceId: invoice.id, invoiceNumber, totalCents: invoice.totalCents } }, tx)
    return { invoiceId: invoice.id, created: true }
  })
}
