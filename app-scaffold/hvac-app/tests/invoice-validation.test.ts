import { describe, it, expect } from 'vitest'
import { createInvoiceSchema, updateInvoiceStatusSchema } from '@/lib/validations/invoice'

describe('createInvoiceSchema', () => {
  const validInput = {
    jobId: 'job-456',
    descriptionOfWork: 'Replaced compressor and recharged refrigerant',
    lineItems: [
      { name: 'Compressor', quantity: 1, unitPriceCents: 120000 },
      { name: 'Labor', quantity: 3, unitPriceCents: 15000 },
    ],
  }

  it('accepts valid invoice', () => {
    expect(createInvoiceSchema.safeParse(validInput).success).toBe(true)
  })

  it('requires description of work', () => {
    const result = createInvoiceSchema.safeParse({ ...validInput, descriptionOfWork: '' })
    expect(result.success).toBe(false)
  })

  it('requires at least one line item', () => {
    const result = createInvoiceSchema.safeParse({ ...validInput, lineItems: [] })
    expect(result.success).toBe(false)
  })

  it('accepts optional due date', () => {
    const result = createInvoiceSchema.safeParse({ ...validInput, dueDate: '2026-05-01' })
    expect(result.success).toBe(true)
  })

  it('line items default taxable to true and taxRateBps to 0', () => {
    const result = createInvoiceSchema.safeParse(validInput)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.lineItems[0].taxable).toBe(true)
      expect(result.data.lineItems[0].taxRateBps).toBe(0)
    }
  })

  it('accepts taxable=false on a line item', () => {
    const result = createInvoiceSchema.safeParse({
      ...validInput,
      lineItems: [{ name: 'Labor', quantity: 1, unitPriceCents: 15000, taxable: false, taxRateBps: 0 }],
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.lineItems[0].taxable).toBe(false)
    }
  })
})

describe('updateInvoiceStatusSchema', () => {
  it('accepts valid statuses', () => {
    for (const status of ['draft', 'sent', 'paid', 'void', 'overdue']) {
      expect(updateInvoiceStatusSchema.safeParse({ status }).success).toBe(true)
    }
  })

  it('rejects invalid status', () => {
    expect(updateInvoiceStatusSchema.safeParse({ status: 'refunded' }).success).toBe(false)
  })
})
