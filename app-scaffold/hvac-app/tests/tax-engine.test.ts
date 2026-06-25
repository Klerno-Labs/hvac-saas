import { describe, it, expect } from 'vitest'
import { createEstimateSchema } from '@/lib/validations/estimate'
import { createInvoiceSchema } from '@/lib/validations/invoice'

function computeTaxCents(
  lineItems: Array<{ lineTotalCents: number; taxable: boolean; taxRateBps: number }>,
): number {
  return lineItems.reduce(
    (sum, li) => sum + (li.taxable ? Math.round(li.lineTotalCents * li.taxRateBps / 10000) : 0),
    0,
  )
}

describe('tax computation', () => {
  // 825 bps = 8.25%; $100.00 (10000 cents) × 8.25% = $8.25 (825 cents)
  it('computes tax on taxable items at the given rate', () => {
    const items = [{ lineTotalCents: 10000, taxable: true, taxRateBps: 825 }]
    expect(computeTaxCents(items)).toBe(825)
  })

  it('produces zero tax on non-taxable items', () => {
    const items = [{ lineTotalCents: 10000, taxable: false, taxRateBps: 825 }]
    expect(computeTaxCents(items)).toBe(0)
  })

  it('handles mixed taxable and non-taxable items', () => {
    const items = [
      { lineTotalCents: 10000, taxable: true, taxRateBps: 825 },
      { lineTotalCents: 5000, taxable: false, taxRateBps: 825 },
    ]
    // Only the first item (10000 × 825 / 10000 = 825) contributes
    expect(computeTaxCents(items)).toBe(825)
  })

  it('produces zero tax when taxRateBps is 0', () => {
    const items = [{ lineTotalCents: 10000, taxable: true, taxRateBps: 0 }]
    expect(computeTaxCents(items)).toBe(0)
  })

  it('sums tax across multiple taxable items', () => {
    // 800 bps = 8%; $100 × 8% = $8 (800 cents); $200 × 8% = $16 (1600 cents)
    const items = [
      { lineTotalCents: 10000, taxable: true, taxRateBps: 800 },
      { lineTotalCents: 20000, taxable: true, taxRateBps: 800 },
    ]
    expect(computeTaxCents(items)).toBe(800 + 1600)
  })

  it('rounds fractional cents', () => {
    // 500 bps = 5%; $1.01 (101 cents) × 5% = 5.05 cents → rounds to 5
    const items = [{ lineTotalCents: 101, taxable: true, taxRateBps: 500 }]
    expect(computeTaxCents(items)).toBe(Math.round(101 * 500 / 10000))
  })
})

describe('estimate schema with tax fields', () => {
  const base = {
    jobId: 'job-1',
    scopeOfWork: 'AC replacement',
    lineItems: [{ name: 'AC Unit', quantity: 1, unitPriceCents: 350000 }],
  }

  it('defaults line item taxable to true and taxRateBps to 0', () => {
    const result = createEstimateSchema.safeParse(base)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.lineItems[0].taxable).toBe(true)
      expect(result.data.lineItems[0].taxRateBps).toBe(0)
    }
  })

  it('accepts explicit taxable=false', () => {
    const result = createEstimateSchema.safeParse({
      ...base,
      lineItems: [{ name: 'Labor', quantity: 2, unitPriceCents: 15000, taxable: false, taxRateBps: 0 }],
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.lineItems[0].taxable).toBe(false)
    }
  })

  it('accepts positive taxRateBps', () => {
    const result = createEstimateSchema.safeParse({
      ...base,
      lineItems: [{ name: 'Part', quantity: 1, unitPriceCents: 10000, taxable: true, taxRateBps: 825 }],
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.lineItems[0].taxRateBps).toBe(825)
    }
  })

  it('rejects negative taxRateBps', () => {
    const result = createInvoiceSchema.safeParse({
      jobId: 'job-1',
      descriptionOfWork: 'Work',
      lineItems: [{ name: 'Part', quantity: 1, unitPriceCents: 10000, taxable: true, taxRateBps: -1 }],
    })
    expect(result.success).toBe(false)
  })
})
