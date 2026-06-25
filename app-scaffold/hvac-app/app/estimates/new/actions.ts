'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { trackEvent } from '@/lib/events'
import { createEstimateSchema } from '@/lib/validations/estimate'
import { generateEstimateDraft } from '@/lib/ai'

type CreateEstimateResult =
  | { success: true; estimateId: string }
  | { success: false; error: string }

export async function createEstimate(input: {
  jobId: string
  scopeOfWork: string
  terms?: string
  notes?: string
  lineItems: { name: string; description?: string; quantity: number; unitPriceCents: number; taxable: boolean; taxRateBps: number }[]
  aiDraftUsed: boolean
}): Promise<CreateEstimateResult> {
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

  const parsed = createEstimateSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0].message }
  }

  const data = parsed.data

  const [job, org] = await Promise.all([
    db.job.findFirst({
      where: { id: data.jobId, organizationId },
      include: { customer: { select: { taxExempt: true } } },
    }),
    db.organization.findUnique({
      where: { id: organizationId },
      select: { defaultTaxRateBps: true },
    }),
  ])

  if (!job) {
    return { success: false, error: 'Job not found in your organization' }
  }

  const customerTaxExempt = job.customer.taxExempt
  const defaultTaxRateBps = org?.defaultTaxRateBps ?? 0

  const lineItemsWithTotals = data.lineItems.map((item, index) => {
    const lineTotalCents = item.quantity * item.unitPriceCents
    const taxable = customerTaxExempt ? false : item.taxable
    const taxRateBps = item.taxRateBps > 0 ? item.taxRateBps : defaultTaxRateBps
    return {
      name: item.name,
      description: item.description || null,
      quantity: item.quantity,
      unitPriceCents: item.unitPriceCents,
      lineTotalCents,
      sortOrder: index,
      taxable,
      taxRateBps,
    }
  })

  const subtotalCents = lineItemsWithTotals.reduce((sum, li) => sum + li.lineTotalCents, 0)
  const taxCents = lineItemsWithTotals.reduce(
    (sum, li) => sum + (li.taxable ? Math.round(li.lineTotalCents * li.taxRateBps / 10000) : 0),
    0,
  )
  const totalCents = subtotalCents + taxCents

  const count = await db.estimate.count({ where: { organizationId } })
  const estimateNumber = `EST-${String(count + 1).padStart(4, '0')}`

  const estimate = await db.estimate.create({
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

  const organizationId = membership.organizationId

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
