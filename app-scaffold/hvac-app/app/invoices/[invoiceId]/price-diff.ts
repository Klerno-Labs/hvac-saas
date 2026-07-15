export type PricingSnapshot = {
  subtotalCents: number
  taxCents: number
  totalCents: number
  lineItems: { name: string; quantity: number; unitPriceCents: number }[]
}

type ChangedLine = {
  name: string
  unitPriceBefore: number
  unitPriceAfter: number
  quantityBefore: number
  quantityAfter: number
}

export type InvoicePriceChangeSummary = {
  subtotalBefore: number
  subtotalAfter: number
  taxBefore: number
  taxAfter: number
  totalBefore: number
  totalAfter: number
  changedLines: ChangedLine[]
} | null

export function summarizeInvoicePriceChange(
  before: PricingSnapshot,
  after: PricingSnapshot,
): InvoicePriceChangeSummary {
  if (
    before.subtotalCents === after.subtotalCents &&
    before.taxCents === after.taxCents &&
    before.totalCents === after.totalCents
  ) {
    return null
  }

  const changedLines: ChangedLine[] = []
  const len = Math.max(before.lineItems.length, after.lineItems.length)
  for (let i = 0; i < len; i++) {
    const b = before.lineItems[i]
    const a = after.lineItems[i]
    if (b && a && (b.unitPriceCents !== a.unitPriceCents || b.quantity !== a.quantity)) {
      changedLines.push({
        name: a.name,
        unitPriceBefore: b.unitPriceCents,
        unitPriceAfter: a.unitPriceCents,
        quantityBefore: b.quantity,
        quantityAfter: a.quantity,
      })
    }
  }

  return {
    subtotalBefore: before.subtotalCents,
    subtotalAfter: after.subtotalCents,
    taxBefore: before.taxCents,
    taxAfter: after.taxCents,
    totalBefore: before.totalCents,
    totalAfter: after.totalCents,
    changedLines,
  }
}
