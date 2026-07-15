import { describe, it, expect } from 'vitest'
import { summarizeInvoicePriceChange } from '@/app/invoices/[invoiceId]/price-diff'
import type { PricingSnapshot } from '@/app/invoices/[invoiceId]/price-diff'

const snap = (overrides: Partial<PricingSnapshot> = {}): PricingSnapshot => ({
  subtotalCents: 10000,
  taxCents: 500,
  totalCents: 10500,
  lineItems: [{ name: 'Labor', quantity: 1, unitPriceCents: 10000 }],
  ...overrides,
})

describe('summarizeInvoicePriceChange', () => {
  it('returns null when totals are identical (nothing priced-changed)', () => {
    const s = snap()
    expect(summarizeInvoicePriceChange(s, { ...s, lineItems: [...s.lineItems] })).toBeNull()
  })

  it('reports changed line item unit prices and quantities', () => {
    const before = snap({
      subtotalCents: 5000,
      totalCents: 5500,
      lineItems: [{ name: 'Labor', quantity: 1, unitPriceCents: 5000 }],
    })
    const after = snap({
      subtotalCents: 8000,
      totalCents: 8500,
      lineItems: [{ name: 'Labor', quantity: 1, unitPriceCents: 8000 }],
    })
    const result = summarizeInvoicePriceChange(before, after)
    expect(result).not.toBeNull()
    expect(result!.changedLines).toEqual([
      { name: 'Labor', unitPriceBefore: 5000, unitPriceAfter: 8000, quantityBefore: 1, quantityAfter: 1 },
    ])
    expect(result!.totalBefore).toBe(5500)
    expect(result!.totalAfter).toBe(8500)
    expect(result!.subtotalBefore).toBe(5000)
    expect(result!.subtotalAfter).toBe(8000)
  })

  it('returns empty changedLines when total delta comes only from tax change', () => {
    const lineItems = [{ name: 'Part', quantity: 2, unitPriceCents: 3000 }]
    const before: PricingSnapshot = { subtotalCents: 6000, taxCents: 500, totalCents: 6500, lineItems }
    const after: PricingSnapshot = { subtotalCents: 6000, taxCents: 1000, totalCents: 7000, lineItems }
    const result = summarizeInvoicePriceChange(before, after)
    expect(result).not.toBeNull()
    expect(result!.changedLines).toHaveLength(0)
    expect(result!.taxBefore).toBe(500)
    expect(result!.taxAfter).toBe(1000)
  })

  it('reports quantity change as a changed line', () => {
    const before = snap({
      subtotalCents: 10000,
      totalCents: 10500,
      lineItems: [{ name: 'Filter', quantity: 1, unitPriceCents: 10000 }],
    })
    const after = snap({
      subtotalCents: 20000,
      totalCents: 20500,
      lineItems: [{ name: 'Filter', quantity: 2, unitPriceCents: 10000 }],
    })
    const result = summarizeInvoicePriceChange(before, after)
    expect(result).not.toBeNull()
    expect(result!.changedLines[0].quantityBefore).toBe(1)
    expect(result!.changedLines[0].quantityAfter).toBe(2)
  })
})
