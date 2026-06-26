'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { trackEvent } from '@/lib/events'
import { updateEstimateSchema, updateEstimateStatusSchema } from '@/lib/validations/estimate'
import { getOrCreatePortalUrl } from '@/lib/portal'
import { sendEstimateEmail } from '@/lib/email'

type ActionResult =
  | { success: true }
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
      where: { id: estimateId },
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

  return { success: true }
}

export async function updateEstimateStatus(
  estimateId: string,
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

  await db.estimate.update({
    where: { id: estimateId },
    data: {
      status,
      sentAt: status === 'sent' && !estimate.sentAt ? new Date() : estimate.sentAt,
      acceptedAt: status === 'accepted' && !estimate.acceptedAt ? new Date() : estimate.acceptedAt,
    },
  })

  // Send email when marking as sent
  const customerEmail = estimate.job.customer.email
  if (status === 'sent' && customerEmail) {
    const customer = estimate.job.customer
    const org = await db.organization.findUniqueOrThrow({ where: { id: organizationId } })
    const portalUrl = await getOrCreatePortalUrl(organizationId, customer.id)

    await sendEstimateEmail({
      to: customerEmail,
      customerName: [customer.firstName, customer.lastName].filter(Boolean).join(' '),
      estimateNumber: estimate.estimateNumber,
      totalFormatted: '$' + (estimate.totalCents / 100).toFixed(2),
      orgName: org.name,
      portalUrl,
    })
  }

  await trackEvent({
    organizationId,
    userId,
    eventName: 'estimate_status_updated',
    entityType: 'estimate',
    entityId: estimateId,
    metadataJson: { from: estimate.status, to: status },
  })

  return { success: true }
}

export async function setEstimateDeposit(
  estimateId: string,
  input: { depositRequired: boolean; depositAmountCents: number },
): Promise<ActionResult> {
  const session = await auth()
  if (!session?.user?.id) {
    return { success: false, error: 'You must be logged in' }
  }

  const membership = await db.organizationMember.findFirst({
    where: { userId: session.user.id },
  })
  if (!membership) {
    return { success: false, error: 'You must belong to an organization' }
  }

  const estimate = await db.estimate.findFirst({
    where: { id: estimateId, organizationId: membership.organizationId },
  })
  if (!estimate) {
    return { success: false, error: 'Estimate not found in your organization' }
  }
  if (estimate.status !== 'draft') {
    return { success: false, error: 'Deposit settings can only be changed on draft estimates' }
  }
  if (input.depositAmountCents < 0) {
    return { success: false, error: 'Deposit amount must be non-negative' }
  }

  await db.estimate.update({
    where: { id: estimateId },
    data: {
      depositRequired: input.depositRequired,
      depositAmountCents: input.depositAmountCents,
    },
  })

  return { success: true }
}
