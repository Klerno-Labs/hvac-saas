export type PaymentRow = { amountCents: number; status: string; paidAt: Date | null }
export type InvoiceRow = {
  totalCents: number
  outstandingCents: number
  status: string
  paidAt: Date | null
  dueDate: Date | null
  createdAt: Date
}
export type EstimateRow = { status: string; sentAt: Date | null }
export type JobRow = { status: string; completedAt: Date | null }

export function revenueInRange(
  payments: PaymentRow[],
  period: { start: Date; end: Date }
): number {
  return payments
    .filter(
      (p) =>
        p.status === 'succeeded' &&
        p.paidAt !== null &&
        p.paidAt >= period.start &&
        p.paidAt <= period.end
    )
    .reduce((sum, p) => sum + p.amountCents, 0)
}

export function avgTicketCents(
  payments: PaymentRow[],
  period: { start: Date; end: Date }
): number {
  const inRange = payments.filter(
    (p) =>
      p.status === 'succeeded' &&
      p.paidAt !== null &&
      p.paidAt >= period.start &&
      p.paidAt <= period.end
  )
  if (inRange.length === 0) return 0
  return Math.round(inRange.reduce((sum, p) => sum + p.amountCents, 0) / inRange.length)
}

export function jobsCompletedInRange(
  jobs: JobRow[],
  period: { start: Date; end: Date }
): number {
  return jobs.filter(
    (j) =>
      j.status === 'completed' &&
      j.completedAt !== null &&
      j.completedAt >= period.start &&
      j.completedAt <= period.end
  ).length
}

export function totalOutstandingCents(invoices: InvoiceRow[]): number {
  return invoices.reduce((sum, i) => sum + i.outstandingCents, 0)
}

export function closeRate(estimates: EstimateRow[]): {
  sent: number
  won: number
  rate: number
} {
  const sent = estimates.filter((e) => e.sentAt !== null).length
  const won = estimates.filter((e) => e.status === 'accepted').length
  return { sent, won, rate: sent === 0 ? 0 : won / sent }
}

export function arAgingBuckets(
  invoices: InvoiceRow[],
  asOf: Date
): { current: number; d1_30: number; d31_60: number; d61_90: number; d90_plus: number } {
  const unpaid = invoices.filter((i) => i.outstandingCents > 0)
  const buckets = { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0 }
  const MS_PER_DAY = 86_400_000

  for (const inv of unpaid) {
    if (!inv.dueDate || inv.dueDate >= asOf) {
      buckets.current += inv.outstandingCents
    } else {
      const daysOverdue = Math.floor(
        (asOf.getTime() - inv.dueDate.getTime()) / MS_PER_DAY
      )
      if (daysOverdue <= 30) buckets.d1_30 += inv.outstandingCents
      else if (daysOverdue <= 60) buckets.d31_60 += inv.outstandingCents
      else if (daysOverdue <= 90) buckets.d61_90 += inv.outstandingCents
      else buckets.d90_plus += inv.outstandingCents
    }
  }

  return buckets
}
