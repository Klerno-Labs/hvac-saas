'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { trackEvent } from '@/lib/events'
import { createInvoiceSchema } from '@/lib/validations/invoice'
import { assertCanWrite, handleGuardError } from '@/lib/billing-guard'

type CreateInvoiceResult =
  | { success: true; invoiceId: string }
  | { success: false; error: string }

export async function createInvoice(input: {
  jobId: string
  descriptionOfWork: string
  notes?: string
  taxCents: number
  dueDate?: string
  lineItems: { name: string; description?: string; quantity: number; unitPriceCents: number }[]
}): Promise<CreateInvoiceResult> {
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

  const parsed = createInvoiceSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0].message }
  }

  const data = parsed.data

  // Verify job belongs to same organization
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

  // Generate invoice number
  const count = await db.invoice.count({ where: { organizationId } })
  const invoiceNumber = `INV-${String(count + 1).padStart(4, '0')}`

  const invoice = await db.invoice.create({
    data: {
      organizationId,
      jobId: data.jobId,
      customerId: job.customerId,
      invoiceNumber,
      descriptionOfWork: data.descriptionOfWork,
      notes: data.notes || null,
      subtotalCents,
      taxCents,
      totalCents,
      outstandingCents: totalCents,
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
      status: 'draft',
      lineItems: {
        create: lineItemsWithTotals,
      },
    },
  })

  await trackEvent({
    organizationId,
    userId,
    eventName: 'invoice_created',
    entityType: 'invoice',
    entityId: invoice.id,
  })

  return { success: true, invoiceId: invoice.id }
}
