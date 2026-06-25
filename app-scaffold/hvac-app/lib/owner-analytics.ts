import { db } from '@/lib/db'

export type AgingBuckets = {
  currentCents: number
  days1to30Cents: number
  days31to60Cents: number
  days61to90Cents: number
  days90plusCents: number
}

export type OwnerAnalytics = {
  revenueCents: number
  completedJobs: number
  avgTicketCents: number
  outstandingArCents: number
  aging: AgingBuckets
  closeRate: {
    sent: number
    won: number
    rate: number
  }
  comingSoon: {
    technicianUtilization: boolean
    jobCostMargin: boolean
  }
}

export async function getOwnerAnalytics(
  organizationId: string,
  start: Date,
  end: Date,
): Promise<OwnerAnalytics> {
  const now = new Date()

  const [payments, completedJobs, outstandingInvoices, sentEstimates] = await Promise.all([
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
      },
      select: { outstandingCents: true, dueDate: true },
    }),
    db.estimate.findMany({
      where: {
        organizationId,
        sentAt: { gte: start, lte: end },
      },
      select: { acceptedAt: true },
    }),
  ])

  const revenueCents = payments.reduce((s, p) => s + p.amountCents, 0)
  const avgTicketCents = completedJobs > 0 ? Math.round(revenueCents / completedJobs) : 0
  const outstandingArCents = outstandingInvoices.reduce((s, i) => s + i.outstandingCents, 0)

  const aging: AgingBuckets = {
    currentCents: 0,
    days1to30Cents: 0,
    days31to60Cents: 0,
    days61to90Cents: 0,
    days90plusCents: 0,
  }

  for (const inv of outstandingInvoices) {
    if (!inv.dueDate || inv.dueDate >= now) {
      aging.currentCents += inv.outstandingCents
    } else {
      const daysOverdue = Math.floor(
        (now.getTime() - inv.dueDate.getTime()) / (1000 * 60 * 60 * 24),
      )
      if (daysOverdue <= 30) {
        aging.days1to30Cents += inv.outstandingCents
      } else if (daysOverdue <= 60) {
        aging.days31to60Cents += inv.outstandingCents
      } else if (daysOverdue <= 90) {
        aging.days61to90Cents += inv.outstandingCents
      } else {
        aging.days90plusCents += inv.outstandingCents
      }
    }
  }

  const sent = sentEstimates.length
  const won = sentEstimates.filter((e) => e.acceptedAt !== null).length
  const rate = sent > 0 ? won / sent : 0

  return {
    revenueCents,
    completedJobs,
    avgTicketCents,
    outstandingArCents,
    aging,
    closeRate: { sent, won, rate },
    comingSoon: {
      technicianUtilization: true,
      jobCostMargin: true,
    },
  }
}
