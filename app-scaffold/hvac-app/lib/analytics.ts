// Pure analytics helpers — no DB access, no side effects

export function revenueInRange(
  payments: { amountCents: number; status: string; paidAt: Date | null }[],
  start: Date,
  end: Date,
): number {
  return payments
    .filter(p => p.status === 'succeeded' && p.paidAt !== null && p.paidAt >= start && p.paidAt <= end)
    .reduce((sum, p) => sum + p.amountCents, 0)
}

export function avgTicketCents(
  payments: { amountCents: number; status: string; paidAt: Date | null }[],
  start: Date,
  end: Date,
): number {
  const matched = payments.filter(
    p => p.status === 'succeeded' && p.paidAt !== null && p.paidAt >= start && p.paidAt <= end,
  )
  if (matched.length === 0) return 0
  return Math.round(matched.reduce((sum, p) => sum + p.amountCents, 0) / matched.length)
}

export type AgingBuckets = {
  current: number
  d1_30: number
  d31_60: number
  d61_90: number
  d90_plus: number
}

export function arAgingBuckets(
  invoices: { outstandingCents: number; dueDate: Date | null }[],
  asOf: Date,
): AgingBuckets {
  const buckets: AgingBuckets = { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0 }
  for (const inv of invoices) {
    if (inv.outstandingCents <= 0) continue
    if (inv.dueDate === null || inv.dueDate >= asOf) {
      buckets.current += inv.outstandingCents
    } else {
      const daysLate = Math.floor((asOf.getTime() - inv.dueDate.getTime()) / 86_400_000)
      if (daysLate <= 30) buckets.d1_30 += inv.outstandingCents
      else if (daysLate <= 60) buckets.d31_60 += inv.outstandingCents
      else if (daysLate <= 90) buckets.d61_90 += inv.outstandingCents
      else buckets.d90_plus += inv.outstandingCents
    }
  }
  return buckets
}

export function closeRate(
  estimates: { status: string; sentAt: Date | null }[],
): { sent: number; won: number; rate: number } {
  const sent = estimates.filter(e => e.sentAt !== null).length
  const won = estimates.filter(e => e.status === 'accepted').length
  return { sent, won, rate: sent > 0 ? won / sent : 0 }
}

export function jobsCompletedInRange(
  jobs: { status: string; completedAt: Date | null }[],
  start: Date,
  end: Date,
): number {
  return jobs.filter(
    j =>
      j.status === 'completed' &&
      j.completedAt !== null &&
      j.completedAt >= start &&
      j.completedAt <= end,
  ).length
}

export function totalOutstandingCents(
  invoices: { outstandingCents: number }[],
): number {
  return invoices.reduce((sum, inv) => sum + inv.outstandingCents, 0)
}
