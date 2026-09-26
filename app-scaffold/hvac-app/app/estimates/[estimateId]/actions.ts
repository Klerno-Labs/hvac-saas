'use server'

import { requireMutationAccess } from '@/lib/mutation-access'
import { db } from '@/lib/db'
import { trackEvent } from '@/lib/events'
import { logAudit } from '@/lib/audit'
import { summarizeInvoicePriceChange } from '@/app/invoices/[invoiceId]/price-diff'
import { updateEstimateSchema, updateEstimateStatusSchema } from '@/lib/validations/estimate'
import { getOrCreatePortalUrl } from '@/lib/portal'
import { sendEstimateEmail } from '@/lib/email'

type ActionResult =
  | { success: true; warning?: string }
  | { success: false; error: string }

export async function updateEstimate(
  estimateId: string,
  input: {
    scopeOfWork: string
    terms?: string
    notes?: string
    taxCents: number
    lineItems: { name: string; description?: string; quantity: number; unitPriceCents: number }[]
  },
): Promise<ActionResult> {
  const access = await requireMutationAccess('editPricing')
  if (!access.authorized) return { success: false, error: access.error }
  const { session, userId, organizationId } = access.context

  const estimate = await db.estimate.findFirst({
    where: { id: estimateId, organizationId },
  })
  if (!estimate) {
    return { success: false, error: 'Estimate not found in your organization' }
  }

  if (estimate.status !== 'draft') {
    return { success: false, error: 'Only draft estimates can be edited' }
  }

  const parsed = updateEstimateSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0].message }
  }

  const data = parsed.data

  const beforeSnapshot = {
    subtotalCents: estimate.subtotalCents,
    taxCents: estimate.taxCents,
    totalCents: estimate.totalCents,
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
    await tx.estimateLineItem.deleteMany({ where: { estimateId } })
    await tx.estimate.update({
      where: { id: estimateId, organizationId, status: 'draft', updatedAt: estimate.updatedAt },
      data: {
        scopeOfWork: data.scopeOfWork,
        terms: data.terms || null,
        notes: data.notes || null,
        subtotalCents,
        taxCents,
        totalCents,
        lineItems: { create: lineItemsWithTotals },
      },
    })
  })

  await trackEvent({
    organizationId,
    userId,
    eventName: 'estimate_updated',
    entityType: 'estimate',
    entityId: estimateId,
  })

  try {
    const priceDiff = summarizeInvoicePriceChange(beforeSnapshot, { subtotalCents, taxCents, totalCents })
    await logAudit({
      organizationId,
      actorId: userId,
      actorEmail: session.user.email ?? undefined,
      eventType: 'estimate.priced',
      targetType: 'estimate',
      targetId: estimateId,
      metadata: { ...(priceDiff ?? {}), estimateId },
    })
  } catch { /* best-effort */ }

  return { success: true }
}

export async function updateEstimateStatus(
  estimateId: string,
  formData: FormData,
): Promise<ActionResult> {
  const access = await requireMutationAccess('editPricing')
  if (!access.authorized) return { success: false, error: access.error }
  const { userId, organizationId } = access.context

  const estimate = await db.estimate.findFirst({
    where: { id: estimateId, organizationId },
    include: {
      job: { include: { customer: true } },
    },
  })
  if (!estimate) {
    return { success: false, error: 'Estimate not found in your organization' }
  }

  const parsed = updateEstimateStatusSchema.safeParse({ status: formData.get('status') })
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0].message }
  }

  const { status } = parsed.data

  if (['sent', 'accepted'].includes(status) && (!Number.isInteger(estimate.totalCents) || estimate.totalCents <= 0)) {
    return { success: false, error: 'Set and review the estimate pricing before sending or accepting it. The total must be greater than zero.' }
  }

  if (estimate.status === 'accepted' || estimate.status === 'declined') return {success: false, error: 'Finalized estimates cannot be reopened. Create a new estimate.'}
  if (status === 'draft' && estimate.status !== 'draft') return {success: false, error: 'Sent estimates cannot be changed back to drafts.'}

  const changed = await db.estimate.updateMany({
    where: { id: estimateId, organizationId, status: estimate.status, updatedAt: estimate.updatedAt },
    data: {
      status,
      sentAt: status === 'sent' && !estimate.sentAt ? new Date() : estimate.sentAt,
      acceptedAt: status === 'accepted' && !estimate.acceptedAt ? new Date() : estimate.acceptedAt,
    },
  })

  if (changed.count !== 1) return {success: false, error: 'This estimate changed. Refresh before trying again.'}

  // Status and customer delivery are distinct outcomes. Never report an
  // email as sent when the delivery provider rejected it or is unavailable.
  let warning: string | undefined
  if (status === 'sent') {
    const customer = estimate.job.customer
    if (!customer.email) {
      warning = 'The estimate is marked sent, but no email was sent because this customer has no email address. Add an email address, then choose Sent again to send it.'
    } else {
      try {
        const org = await db.organization.findUniqueOrThrow({ where: { id: organizationId } })
        const portalUrl = await getOrCreatePortalUrl(organizationId, customer.id)
        const delivery = await sendEstimateEmail({
          to: customer.email,
          customerName: [customer.firstName, customer.lastName].filter(Boolean).join(' '),
          estimateNumber: estimate.estimateNumber,
          totalFormatted: '$' + (estimate.totalCents / 100).toFixed(2),
          orgName: org.name,
          portalUrl,
        })
        if (!delivery.success) warning = 'The estimate is marked sent, but its email could not be delivered. Check email delivery settings, then choose Sent again to retry.'
      } catch (error) {
        console.error('Estimate delivery failed after status update', error)
        warning = 'The estimate is marked sent, but its email could not be delivered. Check email delivery settings, then choose Sent again to retry.'
      }
    }
  }

  await trackEvent({
    organizationId,
    userId,
    eventName: 'estimate_status_updated',
    entityType: 'estimate',
    entityId: estimateId,
    metadataJson: { from: estimate.status, to: status },
  })

  return { success: true, ...(warning ? { warning } : {}) }
}
