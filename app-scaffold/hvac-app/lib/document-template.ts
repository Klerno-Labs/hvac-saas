export type TemplateLine = { description: string; quantity: number; rate: number }

export function validTemplateRate(rate: number) {
  if (!Number.isFinite(rate) || rate < 0 || rate > 1000000) return false
  const cents = rate * 100
  return Math.abs(cents - Math.round(cents)) <= Number.EPSILON * Math.max(1, cents) * 2
}

const roundCents = (value: number) => Math.round(value + Number.EPSILON * Math.max(1, value) * 2)

/** Round each visible line to cents before calculating the displayed subtotal. */
export function templateTotals(lines: TemplateLine[], taxRate: number) {
  if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100 || lines.length > 30) return null
  if (lines.some(line => !Number.isFinite(line.quantity) || line.quantity < 0 || line.quantity > 10000 || !validTemplateRate(line.rate))) return null
  // Unit prices are whole cents; multiplying those cents avoids binary currency drift.
  const amounts = lines.map(line => roundCents(line.quantity * Math.round(line.rate * 100)))
  const subtotal = amounts.reduce((sum, amount) => sum + amount, 0)
  const tax = roundCents(subtotal * taxRate / 100)
  return { amounts, subtotal, tax, total: subtotal + tax }
}
