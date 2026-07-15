import { describe, it, expect } from 'vitest'
import { summarizeInvoicePriceChange } from '@/app/invoices/[invoiceId]/price-diff'

describe('summarizeInvoicePriceChange', () => {
  it('returns null when nothing changed', () => {
    const snapshot = { subtotalCents: 10000, taxCents: 800, totalCents: 10800 }
    expect(summarizeInvoicePriceChange(snapshot, snapshot)).toBeNull()
  })

  it('returns null when all deltas are zero (different objects, same values)', () => {
    const before = { subtotalCents: 10000, taxCents: 800, totalCents: 10800 }
    const after = { subtotalCents: 10000, taxCents: 800, totalCents: 10800 }
    expect(summarizeInvoicePriceChange(before, after)).toBeNull()
  })

  it('reports subtotal and total deltas when line prices change', () => {
    const before = { subtotalCents: 10000, taxCents: 800, totalCents: 10800 }
    const after = { subtotalCents: 15000, taxCents: 800, totalCents: 15800 }
    const result = summarizeInvoicePriceChange(before, after)
    expect(result).not.toBeNull()
    expect(result!.subtotalDelta).toBe(5000)
    expect(result!.taxDelta).toBe(0)
    expect(result!.totalDelta).toBe(5000)
  })

  it('reports all deltas and before/after totals', () => {
    const before = { subtotalCents: 10000, taxCents: 800, totalCents: 10800 }
    const after = { subtotalCents: 15000, taxCents: 1200, totalCents: 16200 }
    const result = summarizeInvoicePriceChange(before, after)
    expect(result!.subtotalDelta).toBe(5000)
    expect(result!.taxDelta).toBe(400)
    expect(result!.totalDelta).toBe(5400)
    expect(result!.beforeTotalCents).toBe(10800)
    expect(result!.afterTotalCents).toBe(16200)
  })

  it('detects tax-only change', () => {
    const before = { subtotalCents: 10000, taxCents: 0, totalCents: 10000 }
    const after = { subtotalCents: 10000, taxCents: 500, totalCents: 10500 }
    const result = summarizeInvoicePriceChange(before, after)
    expect(result).not.toBeNull()
    expect(result!.taxDelta).toBe(500)
    expect(result!.subtotalDelta).toBe(0)
    expect(result!.totalDelta).toBe(500)
  })

  it('handles price decrease (negative deltas)', () => {
    const before = { subtotalCents: 20000, taxCents: 1600, totalCents: 21600 }
    const after = { subtotalCents: 10000, taxCents: 800, totalCents: 10800 }
    const result = summarizeInvoicePriceChange(before, after)
    expect(result!.subtotalDelta).toBe(-10000)
    expect(result!.totalDelta).toBe(-10800)
  })
})
