import { db } from '@/lib/db'

export interface OwnerAnalytics {
  period: { start: string; end: string }
  revenue: {
    invoicedCents: number
    collectedCents: number
    outstandingCents: number
  }
  jobs: {
    created: number
    completed: number
  }
  estimates: {
    created: number
    accepted: number
  }
  customers: {
    total: number
    newInPeriod: number
  }
}

export async function getOwnerAnalytics(
  organizationId: string,
  period: { start: Date; end: Date },
): Promise<OwnerAnalytics> {
  const { start, end } = period

  const [
    invoiceAgg,
    collectedAgg,
    jobsCreated,
    jobsCompleted,
    estimatesCreated,
    estimatesAccepted,
    customersTotal,
    customersNew,
  ] = await Promise.all([
    db.invoice.aggregate({
      where: { organizationId, createdAt: { gte: start, lte: end } },
      _sum: { totalCents: true, outstandingCents: true },
    }),
    db.payment.aggregate({
      where: {
        organizationId,
        status: 'succeeded',
        paidAt: { gte: start, lte: end },
      },
      _sum: { amountCents: true },
    }),
    db.job.count({
      where: { organizationId, createdAt: { gte: start, lte: end } },
    }),
    db.job.count({
      where: {
        organizationId,
        status: 'completed',
        completedAt: { gte: start, lte: end },
      },
    }),
    db.estimate.count({
      where: { organizationId, createdAt: { gte: start, lte: end } },
    }),
    db.estimate.count({
      where: {
        organizationId,
        status: 'accepted',
        acceptedAt: { gte: start, lte: end },
      },
    }),
    db.customer.count({
      where: { organizationId, deletedAt: null },
    }),
    db.customer.count({
      where: { organizationId, deletedAt: null, createdAt: { gte: start, lte: end } },
    }),
  ])

  return {
    period: { start: start.toISOString(), end: end.toISOString() },
    revenue: {
      invoicedCents: invoiceAgg._sum.totalCents ?? 0,
      collectedCents: collectedAgg._sum.amountCents ?? 0,
      outstandingCents: invoiceAgg._sum.outstandingCents ?? 0,
    },
    jobs: {
      created: jobsCreated,
      completed: jobsCompleted,
    },
    estimates: {
      created: estimatesCreated,
      accepted: estimatesAccepted,
    },
    customers: {
      total: customersTotal,
      newInPeriod: customersNew,
    },
  }
}
