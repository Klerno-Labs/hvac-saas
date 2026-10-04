import { describe, expect, it } from 'vitest'
import { createEstimateSchema, updateEstimateSchema } from '@/lib/validations/estimate'
import { createInvoiceSchema, updateInvoiceSchema } from '@/lib/validations/invoice'
import { MAX_DOCUMENT_CENTS } from '@/lib/validations/document'

const document = {
  jobId: 'job1', scopeOfWork: 'Service equipment', descriptionOfWork: 'Service equipment',
  taxCents: 100, lineItems: [{ name: 'Labor', quantity: 2, unitPriceCents: 5000 }],
}

describe.each([
  ['new estimate', createEstimateSchema], ['edit estimate', updateEstimateSchema],
  ['new invoice', createInvoiceSchema], ['edit invoice', updateInvoiceSchema],
] as const)('%s monetary validation', (_, schema) => {
  it('accepts normal integer cent amounts', () => expect(schema.safeParse(document).success).toBe(true))
  it('rejects whitespace-only scope or item names', () => {
    expect(schema.safeParse({ ...document, scopeOfWork: ' ', descriptionOfWork: ' ' }).success).toBe(false)
    expect(schema.safeParse({ ...document, lineItems: [{ name: ' ', quantity: 1, unitPriceCents: 0 }] }).success).toBe(false)
  })
  it.each([
    { taxCents: MAX_DOCUMENT_CENTS + 1 },
    { lineItems: [{ name: 'Part', quantity: 2, unitPriceCents: MAX_DOCUMENT_CENTS }] },
    { lineItems: [{ name: 'Part', quantity: 1, unitPriceCents: MAX_DOCUMENT_CENTS }] },
    { lineItems: [{ name: 'Part', quantity: 1, unitPriceCents: 0.1 }] },
    { lineItems: [{ name: 'Part', quantity: Infinity, unitPriceCents: 0 }] },
  ])('rejects invalid or overflowing values: %j', value => expect(schema.safeParse({ ...document, ...value }).success).toBe(false))
  it('rejects a subtotal overflow across otherwise valid line items', () => {
    expect(schema.safeParse({ ...document, lineItems: [
      { name: 'Part one', quantity: 1, unitPriceCents: 1_500_000_000 },
      { name: 'Part two', quantity: 1, unitPriceCents: 1_500_000_000 },
    ] }).success).toBe(false)
  })
})

describe('invoice due dates', () => {
  it.each(['2026-02-30', '2025-02-29', 'not-a-date', '2026-13-01', '2026-01-01T12:00:00Z', '2026-1-1'])('rejects invalid calendar date %s', dueDate => {
    expect(createInvoiceSchema.safeParse({ ...document, dueDate }).success).toBe(false)
    expect(updateInvoiceSchema.safeParse({ ...document, dueDate }).success).toBe(false)
  })
  it.each(['2028-02-29', '2026-12-31', ''])('accepts date %s', dueDate => expect(createInvoiceSchema.safeParse({ ...document, dueDate }).success).toBe(true))
})
