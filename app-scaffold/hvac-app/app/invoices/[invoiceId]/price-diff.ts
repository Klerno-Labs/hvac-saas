type PriceSummary = { subtotalCents: number; taxCents: number; totalCents: number }

export type PriceChangeSummary = {
  subtotalDelta: number
  taxDelta: number
  totalDelta: number
  beforeTotalCents: number
  afterTotalCents: number
}

export function summarizeInvoicePriceChange(
  before: PriceSummary,
  after: PriceSummary,
): PriceChangeSummary | null {
  const subtotalDelta = after.subtotalCents - before.subtotalCents
  const taxDelta = after.taxCents - before.taxCents
  const totalDelta = after.totalCents - before.totalCents
  if (subtotalDelta === 0 && taxDelta === 0 && totalDelta === 0) return null
  return {
    subtotalDelta,
    taxDelta,
    totalDelta,
    beforeTotalCents: before.totalCents,
    afterTotalCents: after.totalCents,
  }
}
