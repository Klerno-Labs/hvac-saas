import { describe, it, expect, vi } from 'vitest'
import { assembleOwnerAnalytics, getOwnerAnalytics } from '@/lib/owner-analytics'
import type { PaymentRow, InvoiceRow, EstimateRow, JobRow } from '@/lib/analytics'
import { db } from '@/lib/db'

vi.mock('@/lib/db', () => ({
  db: {
    payment: { findMany: vi.fn().mockResolvedValue([]) },
    invoice: { findMany: vi.fn().mockResolvedValue([]) },
    estimate: { findMany: vi.fn().mockResolvedValue([]) },
    job: { findMany: vi.fn().mockResolvedValue([]) },
  },
}))

const period = {
  start: new Date('2025-01-01T00:00:00Z'),
  end: new Date('2025-01-31T23:59:59Z'),
}
const asOf = new Date('2025-02-01T00:00:00Z')

describe('assembleOwnerAnalytics', () => {
  it('wires revenueCents from succeeded payments within the period only', () => {
    const payments: PaymentRow[] = [
      { amountCents: 10000, status: 'succeeded', paidAt: new Date('2025-01-15T00:00:00Z') },
      { amountCents: 5000, status: 'succeeded', paidAt: new Date('2024-12-01T00:00:00Z') }, // outside period
      { amountCents: 2000, status: 'pending', paidAt: new Date('2025-01-20T00:00:00Z') }, // not succeeded
    ]
    const result = assembleOwnerAnalytics(
      { payments, invoices: [], estimates: [], jobs: [] },
      period,
      asOf
    )
    expect(result.revenueCents).toBe(10000)
  })

  it('wires avgTicketCents as mean of succeeded payments in period', () => {
    const payments: PaymentRow[] = [
      { amountCents: 10000, status: 'succeeded', paidAt: new Date('2025-01-10T00:00:00Z') },
      { amountCents: 20000, status: 'succeeded', paidAt: new Date('2025-01-20T00:00:00Z') },
    ]
    const result = assembleOwnerAnalytics(
      { payments, invoices: [], estimates: [], jobs: [] },
      period,
      asOf
    )
    expect(result.avgTicketCents).toBe(15000)
  })

  it('wires jobsCompleted from completed jobs with completedAt in period', () => {
    const jobs: JobRow[] = [
      { status: 'completed', completedAt: new Date('2025-01-15T00:00:00Z') },
      { status: 'completed', completedAt: new Date('2024-12-01T00:00:00Z') }, // outside period
      { status: 'draft', completedAt: null },
    ]
    const result = assembleOwnerAnalytics(
      { payments: [], invoices: [], estimates: [], jobs },
      period,
      asOf
    )
    expect(result.jobsCompleted).toBe(1)
  })

  it('wires outstandingCents as sum of all invoice outstandingCents', () => {
    const invoices: InvoiceRow[] = [
      { totalCents: 10000, outstandingCents: 5000, status: 'sent', paidAt: null, dueDate: null, createdAt: new Date('2025-01-01T00:00:00Z') },
      { totalCents: 8000, outstandingCents: 3000, status: 'sent', paidAt: null, dueDate: null, createdAt: new Date('2025-01-05T00:00:00Z') },
    ]
    const result = assembleOwnerAnalytics(
      { payments: [], invoices, estimates: [], jobs: [] },
      period,
      asOf
    )
    expect(result.outstandingCents).toBe(8000)
  })

  it('wires closeRate with sent count, won count, and rate', () => {
    const estimates: EstimateRow[] = [
      { status: 'accepted', sentAt: new Date('2025-01-01T00:00:00Z') },
      { status: 'sent', sentAt: new Date('2025-01-05T00:00:00Z') },
      { status: 'draft', sentAt: null },
    ]
    const result = assembleOwnerAnalytics(
      { payments: [], invoices: [], estimates, jobs: [] },
      period,
      asOf
    )
    expect(result.closeRate).toEqual({ sent: 2, won: 1, rate: 0.5 })
  })

  it('wires aging buckets placing 32-day-overdue invoice in d31_60', () => {
    // asOf=2025-02-01, dueDate=2024-12-31 → 32 days overdue
    const invoices: InvoiceRow[] = [
      {
        totalCents: 5000,
        outstandingCents: 5000,
        status: 'sent',
        paidAt: null,
        dueDate: new Date('2024-12-31T00:00:00Z'),
        createdAt: new Date('2024-12-01T00:00:00Z'),
      },
    ]
    const result = assembleOwnerAnalytics(
      { payments: [], invoices, estimates: [], jobs: [] },
      period,
      asOf
    )
    expect(result.aging.d31_60).toBe(5000)
    expect(result.aging.current).toBe(0)
    expect(result.aging.d1_30).toBe(0)
  })

  it('always returns comingSoon.utilization and comingSoon.jobCostMargin as true', () => {
    const result = assembleOwnerAnalytics(
      { payments: [], invoices: [], estimates: [], jobs: [] },
      period,
      asOf
    )
    expect(result.comingSoon.utilization).toBe(true)
    expect(result.comingSoon.jobCostMargin).toBe(true)
  })

  it('includes the supplied period in the DTO', () => {
    const result = assembleOwnerAnalytics(
      { payments: [], invoices: [], estimates: [], jobs: [] },
      period,
      asOf
    )
    expect(result.period).toBe(period)
  })
})

describe('getOwnerAnalytics - org scoping', () => {
  it('passes organizationId in where clause on every Prisma query', async () => {
    await getOwnerAnalytics('org-abc', period)
    const orgMatcher = expect.objectContaining({ where: expect.objectContaining({ organizationId: 'org-abc' }) })
    expect(db.payment.findMany).toHaveBeenCalledWith(orgMatcher)
    expect(db.invoice.findMany).toHaveBeenCalledWith(orgMatcher)
    expect(db.estimate.findMany).toHaveBeenCalledWith(orgMatcher)
    expect(db.job.findMany).toHaveBeenCalledWith(orgMatcher)
  })
})
