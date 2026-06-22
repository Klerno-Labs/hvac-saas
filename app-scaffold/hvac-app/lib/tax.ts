/**
 * Sales-tax engine.
 *
 * Tax is computed from taxable line-item subtotals using a rate expressed in
 * basis points (1 bps = 0.01%; 825 bps = 8.25%). Basis points avoid the
 * floating-point drift that haunts percentage math.
 *
 * Resolution order for a single line item's effective rate:
 *   1. If the customer is tax-exempt  -> 0 bps (exemption wins).
 *   2. If the line item has taxRateBps set -> use that override.
 *   3. Otherwise -> fall back to the org default (org.defaultTaxRateBps).
 *
 * Tax is rounded per line item (Math.round, half-up) and then summed. Per-line
 * rounding matches how QuickBooks Online applies line-level sales tax and keeps
 * the breakdown auditable when mixed rates are present.
 *
 * The computed `taxCents` is persisted on the Estimate/Invoice at write time
 * (create/update). Historical documents are never recomputed on read — their
 * stored `taxCents` is the source of truth. This is critical for accounting
 * integrity: a sent/paid invoice must not silently change when the org later
 * updates its default rate.
 */

export const MAX_TAX_RATE_BPS = 100_000 // 1,000% — generous upper bound

export type TaxableLine = {
  lineTotalCents: number
  taxable: boolean
  /** null = inherit org default; a concrete value = per-line override. */
  taxRateBps: number | null
}

export type TaxBreakdownLine = TaxableLine & {
  lineTaxCents: number
  effectiveRateBps: number
}

export type TaxComputation = {
  taxCents: number
  taxableSubtotalCents: number
  lines: TaxBreakdownLine[]
}

/**
 * Compute sales tax for a set of line items.
 *
 * Returns the total tax in cents, the taxable subtotal, and a per-line
 * breakdown (useful for QBO sync and audit trails).
 */
export function computeTaxCents(
  lineItems: TaxableLine[],
  orgDefaultTaxRateBps: number,
  customerTaxExempt: boolean,
): TaxComputation {
  let taxCents = 0
  let taxableSubtotalCents = 0

  const lines = lineItems.map((li) => {
    if (!li.taxable || customerTaxExempt) {
      return { ...li, lineTaxCents: 0, effectiveRateBps: 0 }
    }

    const effectiveRateBps = li.taxRateBps ?? orgDefaultTaxRateBps
    const lineTaxCents = Math.round((li.lineTotalCents * effectiveRateBps) / 10_000)

    taxCents += lineTaxCents
    taxableSubtotalCents += li.lineTotalCents

    return { ...li, lineTaxCents, effectiveRateBps }
  })

  return { taxCents, taxableSubtotalCents, lines }
}

/**
 * Resolve the effective rate for a single line item (for display/preview).
 * Returns 0 for non-taxable or exempt customers.
 */
export function effectiveRateBps(
  line: Pick<TaxableLine, 'taxable' | 'taxRateBps'>,
  orgDefaultTaxRateBps: number,
  customerTaxExempt: boolean,
): number {
  if (!line.taxable || customerTaxExempt) return 0
  return line.taxRateBps ?? orgDefaultTaxRateBps
}

/** Format basis points as a human-readable percentage: 825 -> "8.25%". */
export function formatBpsAsPercent(bps: number): string {
  return (bps / 100).toFixed(2) + '%'
}

/** Convert a percentage string/number (e.g. "8.25" or 8.25) to basis points (825). */
export function percentToBps(percent: number | string): number {
  return Math.round((typeof percent === 'string' ? parseFloat(percent) : percent) * 100)
}
