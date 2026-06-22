'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { trackEvent } from '@/lib/events'
import { createInvoiceSchema } from '@/lib/validations/invoice'
import { computeTaxCents } from '@/lib/tax'

type CreateInvoiceResult =
  | { success: true; invoiceId: string }
  | { success: false; error: string }

export async function createInvoice(input: {
  jobId: string
  descriptionOfWork: string
  notes?: string
  dueDate?: string
  lineItems: { name: string; description?: string; quantity: number; unitPriceCents: number; taxable?: boolean; taxRateBps?: number | null }[]
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

  const parsed = createInvoiceSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0].message }
  }

  const data = parsed.data

  // Verify job belongs to same organization and load the customer (for exemption)
  const job = await db.job.findFirst({
    where: { id: data.jobId, organizationId },
    include: { customer: { select: { taxExempt: true } } },
  })
  if (!job) {
    return { success: false, error: 'Job not found in your organization' }
  }

  const [org] = await Promise.all([
    db.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: { defaultTaxRateBps: true },
    }),
  ])

  const customerTaxExempt = job.customer.taxExempt

  // Calculate totals server-side (line totals + computed tax)
  const lineItemsWithTotals = data.lineItems.map((item, index) => {
    const lineTotalCents = item.quantity * item.unitPriceCents
    return {
      name: item.name,
      description: item.description || null,
      quantity: item.quantity,
      unitPriceCents: item.unitPriceCents,
      lineTotalCents,
      taxable: item.taxable,
      taxRateBps: item.taxRateBps ?? null,
      sortOrder: index,
    }
  })

  const subtotalCents = lineItemsWithTotals.reduce((sum, li) => sum + li.lineTotalCents, 0)
  const { taxCents } = computeTaxCents(
    lineItemsWithTotals.map((li) => ({ lineTotalCents: li.lineTotalCents, taxable: li.taxable, taxRateBps: li.taxRateBps })),
    org.defaultTaxRateBps,
    customerTaxExempt,
  )
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

