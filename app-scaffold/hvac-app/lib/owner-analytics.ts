import { db } from '@/lib/db'

export type OwnerAnalytics = {
  period: { start: string; end: string }
  revenue: {
    collectedCents: number
    outstandingCents: number
    invoiceCount: number
    paidInvoiceCount: number
  }
  jobs: {
    completedInPeriod: number
    total: number
  }
  customers: {
    newInPeriod: number
    total: number
  }
}

export async function getOwnerAnalytics(
  organizationId: string,
  period: { start: Date; end: Date },
): Promise<OwnerAnalytics> {
  const { start, end } = period

  const [
    collected,
    outstanding,
    completedJobs,
    totalJobs,
    newCustomers,
    totalCustomers,
    periodInvoices,
    paidInvoiceCount,
  ] = await Promise.all([
    db.payment.aggregate({
      where: {
        organizationId,
        status: 'succeeded',
        paidAt: { gte: start, lte: end },
      },
      _sum: { amountCents: true },
    }),
    db.invoice.aggregate({
      where: {
        organizationId,
        status: { notIn: ['paid', 'void'] },
      },
      _sum: { outstandingCents: true },
    }),
    db.job.count({
      where: {
        organizationId,
        status: 'completed',
        completedAt: { gte: start, lte: end },
      },
    }),
    db.job.count({ where: { organizationId } }),
    db.customer.count({
      where: {
        organizationId,
        deletedAt: null,
        createdAt: { gte: start, lte: end },
      },
    }),
    db.customer.count({ where: { organizationId, deletedAt: null } }),
    db.invoice.count({
      where: { organizationId, createdAt: { gte: start, lte: end } },
    }),
    db.invoice.count({
      where: {
        organizationId,
        status: 'paid',
        paidAt: { gte: start, lte: end },
      },
    }),
  ])

  return {
    period: {
      start: start.toISOString(),
      end: end.toISOString(),
    },
    revenue: {
      collectedCents: collected._sum.amountCents ?? 0,
      outstandingCents: outstanding._sum.outstandingCents ?? 0,
      invoiceCount: periodInvoices,
      paidInvoiceCount,
    },
    jobs: {
      completedInPeriod: completedJobs,
      total: totalJobs,
    },
    customers: {
      newInPeriod: newCustomers,
      total: totalCustomers,
    },
  }
}
