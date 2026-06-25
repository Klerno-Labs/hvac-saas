import { db } from '@/lib/db'
import {
  revenueInRange,
  avgTicketCents,
  arAgingBuckets,
  closeRate,
  jobsCompletedInRange,
  totalOutstandingCents,
} from '@/lib/analytics'

export type OwnerAnalytics = {
  period: { start: Date; end: Date }
  revenueCents: number
  avgTicketCents: number
  jobsCompleted: number
  outstandingCents: number
  closeRate: { sent: number; won: number; rate: number }
  aging: { current: number; d1_30: number; d31_60: number; d61_90: number; d90_plus: number }
  comingSoon: { utilization: true; jobCostMargin: true }
}

type PaymentRow = { amountCents: number; status: string; paidAt: Date | null }
type InvoiceRow = {
  totalCents: number
  outstandingCents: number
  status: string
  paidAt: Date | null
  dueDate: Date | null
  createdAt: Date
}
type EstimateRow = { status: string; sentAt: Date | null }
type JobRow = { status: string; completedAt: Date | null }

type RawRows = {
  payments: PaymentRow[]
  invoices: InvoiceRow[]
  estimates: EstimateRow[]
  jobs: JobRow[]
}

export function assembleOwnerAnalytics(
  rows: RawRows,
  period: { start: Date; end: Date },
  asOf = new Date(),
): OwnerAnalytics {
  return {
    period,
    revenueCents: revenueInRange(rows.payments, period.start, period.end),
    avgTicketCents: avgTicketCents(rows.payments, period.start, period.end),
    jobsCompleted: jobsCompletedInRange(rows.jobs, period.start, period.end),
    outstandingCents: totalOutstandingCents(rows.invoices),
    closeRate: closeRate(rows.estimates),
    aging: arAgingBuckets(rows.invoices, asOf),
    comingSoon: { utilization: true, jobCostMargin: true },
  }
}

export async function getOwnerAnalytics(
  organizationId: string,
  period: { start: Date; end: Date },
): Promise<OwnerAnalytics> {
  const [payments, invoices, estimates, jobs] = await Promise.all([
    db.payment.findMany({
      where: { organizationId },
      select: { amountCents: true, status: true, paidAt: true },
    }),
    db.invoice.findMany({
      where: { organizationId },
      select: {
        totalCents: true,
        outstandingCents: true,
        status: true,
        paidAt: true,
        dueDate: true,
        createdAt: true,
      },
    }),
    db.estimate.findMany({
      where: { organizationId },
      select: { status: true, sentAt: true },
    }),
    db.job.findMany({
      where: { organizationId },
      select: { status: true, completedAt: true },
    }),
  ])

  return assembleOwnerAnalytics({ payments, invoices, estimates, jobs })
}
