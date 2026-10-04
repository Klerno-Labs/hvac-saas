'use server'

import { nextDocumentNumber } from '@/lib/document-number'
import { requireMutationAccess } from '@/lib/mutation-access'
import { db } from '@/lib/db'
import { trackEvent } from '@/lib/events'
import { createEstimateSchema } from '@/lib/validations/estimate'
import { generateEstimateDraft } from '@/lib/ai'
import { getTradeProfile } from '@/lib/trades'

type CreateEstimateResult =
  | { success: true; estimateId: string }
  | { success: false; error: string }

export async function createEstimate(input: {
  jobId: string
  scopeOfWork: string
  terms?: string
  notes?: string
  taxCents: number
  lineItems: { name: string; description?: string; quantity: number; unitPriceCents: number }[]
  aiDraftUsed: boolean
}): Promise<CreateEstimateResult> {
  const access = await requireMutationAccess('editPricing')
  if (!access.authorized) return { success: false, error: access.error }
  const { userId, organizationId } = access.context

  const parsed = createEstimateSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0].message }
  }

  const data = parsed.data

  // Verify job belongs to the same organization
  const job = await db.job.findFirst({
    where: { id: data.jobId, organizationId },
  })
  if (!job) {
    return { success: false, error: 'Job not found in your organization' }
  }

  // Calculate totals server-side
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

  const estimate = await db.$transaction(async tx => {
    const estimateNumber = await nextDocumentNumber(tx, organizationId, 'estimate')
    return tx.estimate.create({
    data: {
      organizationId,
      jobId: data.jobId,
      estimateNumber,
      scopeOfWork: data.scopeOfWork,
      terms: data.terms || null,
      notes: data.notes || null,
      subtotalCents,
      taxCents,
      totalCents,
      aiDraftUsed: input.aiDraftUsed,
      status: 'draft',
      lineItems: {
        create: lineItemsWithTotals,
      },
    },
  })
  })

  await trackEvent({
    organizationId,
    userId,
    eventName: 'estimate_created',
    entityType: 'estimate',
    entityId: estimate.id,
    metadataJson: { aiDraftUsed: input.aiDraftUsed },
  })

  return { success: true, estimateId: estimate.id }
}

type AiDraftResult =
  | { success: true; draft: { scopeOfWork: string; lineItems: { name: string; description: string; quantity: number; unitPriceCents: number }[]; notes: string } }
  | { success: false; error: string }

export async function generateAiDraft(jobId: string): Promise<AiDraftResult> {
  const access = await requireMutationAccess('editPricing')
  if (!access.authorized) return { success: false, error: access.error }
  const { session, membership, userId, organizationId } = access.context

  const job = await db.job.findFirst({
    where: { id: jobId, organizationId },
    include: { customer: true },
  })
  if (!job) {
    return { success: false, error: 'Job not found in your organization' }
  }

  try {
    const draft = await generateEstimateDraft(
      {
        title: job.title,
        notes: job.notes,
        status: job.status,
        scheduledFor: job.scheduledFor,
      },
      {
        firstName: job.customer.firstName,
        lastName: job.customer.lastName,
        companyName: job.customer.companyName,
        addressLine1: job.customer.addressLine1,
        city: job.customer.city,
        state: job.customer.state,
      },
      getTradeProfile(membership.organization.tradeType),
    )

    await trackEvent({
      organizationId,
      userId: session.user.id,
      eventName: 'estimate_ai_draft_generated',
      entityType: 'job',
      entityId: jobId,
    })

    return { success: true, draft }
  } catch (error) {
    console.error('AI draft generation failed:', error)
    return { success: false, error: 'Failed to generate AI draft. Please fill in the estimate manually.' }
  }
}
