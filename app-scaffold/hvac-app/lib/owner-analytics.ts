import { db } from '@/lib/db'
import { Period, periodDateRange } from '@/lib/period'

export type OwnerAnalytics = {
  revenueCents: number
  avgTicketCents: number
  jobsCompleted: number
  outstandingCents: number
  aging: {
    current: number
    days1_30: number
    days31_60: number
    days61_90: number
    days90plus: number
  }
  closeRate: {
    won: number
    sent: number
    rate: number
  }
  comingSoon: {
    technicianUtilization: boolean
    jobCostMargin: boolean
  }
}

export async function getOwnerAnalytics(
  organizationId: string,
  period: Period,
): Promise<OwnerAnalytics> {
  const { start, end } = periodDateRange(period)
  const now = new Date()

  const [payments, completedJobs, outstandingInvoices, estimatesSent, estimatesWon] =
    await Promise.all([
      db.payment.findMany({
        where: {
          organizationId,
          status: 'succeeded',
          paidAt: { gte: start, lte: end },
        },
        select: { amountCents: true },
      }),
      db.job.count({
        where: {
          organizationId,
          status: 'completed',
          completedAt: { gte: start, lte: end },
        },
      }),
      db.invoice.findMany({
        where: {
          organizationId,
          status: { notIn: ['paid', 'void'] },
          outstandingCents: { gt: 0 },
        },
        select: { outstandingCents: true, dueDate: true },
      }),
      db.estimate.count({
        where: {
          organizationId,
          sentAt: { gte: start, lte: end },
          status: { not: 'draft' },
        },
      }),
      db.estimate.count({
        where: {
          organizationId,
          sentAt: { gte: start, lte: end },
          status: 'accepted',
        },
      }),
    ])

  const revenueCents = payments.reduce((s, p) => s + p.amountCents, 0)
  const outstandingCents = outstandingInvoices.reduce((s, inv) => s + inv.outstandingCents, 0)

  const aging = { current: 0, days1_30: 0, days31_60: 0, days61_90: 0, days90plus: 0 }
  for (const inv of outstandingInvoices) {
    if (!inv.dueDate || inv.dueDate >= now) {
      aging.current += inv.outstandingCents
    } else {
      const daysOverdue = Math.floor(
        (now.getTime() - inv.dueDate.getTime()) / (1000 * 60 * 60 * 24),
      )
      if (daysOverdue <= 30) aging.days1_30 += inv.outstandingCents
      else if (daysOverdue <= 60) aging.days31_60 += inv.outstandingCents
      else if (daysOverdue <= 90) aging.days61_90 += inv.outstandingCents
      else aging.days90plus += inv.outstandingCents
    }
  }

  return {
    revenueCents,
    avgTicketCents: completedJobs > 0 ? Math.round(revenueCents / completedJobs) : 0,
    jobsCompleted: completedJobs,
    outstandingCents,
    aging,
    closeRate: {
      won: estimatesWon,
      sent: estimatesSent,
      rate: estimatesSent > 0 ? estimatesWon / estimatesSent : 0,
    },
    comingSoon: {
      technicianUtilization: true,
      jobCostMargin: true,
    },
  }
}
