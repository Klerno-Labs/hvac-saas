// Pure functions only — caller MUST pre-filter by organizationId.

export type InvoiceRow = {
  totalCents: number
  outstandingCents: number
  status: string
  paidAt: Date | null
  dueDate: Date | null
  createdAt: Date
}

export type PaymentRow = {
  amountCents: number
  paidAt: Date | null
  status: string
}

export type EstimateRow = {
  status: string
  sentAt: Date | null
}

export type JobRow = {
  status: string
  completedAt: Date | null
}

export function revenueInRange(payments: PaymentRow[], start: Date, end: Date): number {
  // Spec: status==='succeeded' OR paidAt!=null; use paidAt for date; skip null-paidAt rows.
  // Since null-paidAt rows are skipped, all surviving rows satisfy the OR condition.
  return payments.reduce((sum, p) => {
    if (p.paidAt === null) return sum
    const t = p.paidAt.getTime()
    if (t >= start.getTime() && t < end.getTime()) return sum + p.amountCents
    return sum
  }, 0)
}

export function avgTicketCents(paidInvoices: InvoiceRow[]): number {
  const paid = paidInvoices.filter(i => i.status === 'paid')
  if (paid.length === 0) return 0
  return paid.reduce((sum, i) => sum + i.totalCents, 0) / paid.length
}

export function arAgingBuckets(
  invoices: InvoiceRow[],
  asOf: Date,
): { current: number; d1_30: number; d31_60: number; d61_90: number; d90_plus: number } {
  const result = { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0 }
  const excluded = new Set(['paid', 'void', 'draft'])
  for (const inv of invoices) {
    if (excluded.has(inv.status)) continue
    if (inv.outstandingCents <= 0) continue
    if (inv.dueDate === null) {
      result.current += inv.outstandingCents
      continue
    }
    const daysPast = Math.floor((asOf.getTime() - inv.dueDate.getTime()) / (1000 * 60 * 60 * 24))
    if (daysPast <= 0) result.current += inv.outstandingCents
    else if (daysPast <= 30) result.d1_30 += inv.outstandingCents
    else if (daysPast <= 60) result.d31_60 += inv.outstandingCents
    else if (daysPast <= 90) result.d61_90 += inv.outstandingCents
    else result.d90_plus += inv.outstandingCents
  }
  return result
}

export function closeRate(estimates: EstimateRow[]): { sent: number; won: number; rate: number } {
  const sent = estimates.filter(e => e.sentAt !== null).length
  const won = estimates.filter(e => e.status === 'accepted').length
  return { sent, won, rate: sent === 0 ? 0 : won / sent }
}

export function jobsCompletedInRange(jobs: JobRow[], start: Date, end: Date): number {
  return jobs.filter(j => {
    if (j.status !== 'completed' || j.completedAt === null) return false
    const t = j.completedAt.getTime()
    return t >= start.getTime() && t < end.getTime()
  }).length
}

export function totalOutstandingCents(invoices: InvoiceRow[]): number {
  const excluded = new Set(['paid', 'void', 'draft'])
  return invoices.reduce((sum, i) => {
    if (excluded.has(i.status)) return sum
    return sum + i.outstandingCents
  }, 0)
}
