import { describe, it, expect } from 'vitest'
import { assembleOwnerAnalytics } from '@/lib/owner-analytics'

const period = { start: new Date('2025-01-01'), end: new Date('2025-01-31') }
const asOf = new Date('2025-02-15')

const emptyRows = { payments: [], invoices: [], estimates: [], jobs: [] }

describe('assembleOwnerAnalytics', () => {
  it('echoes the period into the DTO', () => {
    const result = assembleOwnerAnalytics(emptyRows, period, asOf)
    expect(result.period).toEqual(period)
  })

  it('wires revenueCents to revenueInRange — sums succeeded payments in period', () => {
    const payments = [
      { amountCents: 10_000, status: 'succeeded', paidAt: new Date('2025-01-15') },
      { amountCents: 5_000, status: 'succeeded', paidAt: new Date('2025-01-20') },
      { amountCents: 3_000, status: 'pending', paidAt: new Date('2025-01-10') },   // wrong status
      { amountCents: 2_000, status: 'succeeded', paidAt: new Date('2024-12-31') }, // out of range
    ]
    const result = assembleOwnerAnalytics({ ...emptyRows, payments }, period, asOf)
    expect(result.revenueCents).toBe(15_000)
  })

  it('wires avgTicketCents to avgTicketCents helper', () => {
    const payments = [
      { amountCents: 10_000, status: 'succeeded', paidAt: new Date('2025-01-10') },
      { amountCents: 20_000, status: 'succeeded', paidAt: new Date('2025-01-20') },
    ]
    const result = assembleOwnerAnalytics({ ...emptyRows, payments }, period, asOf)
    expect(result.avgTicketCents).toBe(15_000)
  })

  it('wires jobsCompleted to jobsCompletedInRange', () => {
    const jobs = [
      { status: 'completed', completedAt: new Date('2025-01-10') },
      { status: 'completed', completedAt: new Date('2025-01-25') },
      { status: 'completed', completedAt: new Date('2024-12-20') }, // out of range
      { status: 'scheduled', completedAt: null },
    ]
    const result = assembleOwnerAnalytics({ ...emptyRows, jobs }, period, asOf)
    expect(result.jobsCompleted).toBe(2)
  })

  it('wires outstandingCents to totalOutstandingCents — sums all invoices', () => {
    const invoices = [
      { totalCents: 10_000, outstandingCents: 5_000, status: 'sent', paidAt: null, dueDate: null, createdAt: new Date() },
      { totalCents: 8_000, outstandingCents: 8_000, status: 'sent', paidAt: null, dueDate: null, createdAt: new Date() },
      { totalCents: 6_000, outstandingCents: 0, status: 'paid', paidAt: new Date(), dueDate: null, createdAt: new Date() },
    ]
    const result = assembleOwnerAnalytics({ ...emptyRows, invoices }, period, asOf)
    expect(result.outstandingCents).toBe(13_000)
  })

  it('wires closeRate to closeRate helper', () => {
    const estimates = [
      { status: 'accepted', sentAt: new Date('2025-01-05') },
      { status: 'accepted', sentAt: new Date('2025-01-10') },
      { status: 'declined', sentAt: new Date('2025-01-12') },
      { status: 'draft', sentAt: null },
    ]
    const result = assembleOwnerAnalytics({ ...emptyRows, estimates }, period, asOf)
    expect(result.closeRate.sent).toBe(3)
    expect(result.closeRate.won).toBe(2)
    expect(result.closeRate.rate).toBeCloseTo(2 / 3)
  })

  it('wires aging to arAgingBuckets using the provided asOf date', () => {
    // asOf = 2025-02-15
    const invoices = [
      // current: dueDate in future
      { totalCents: 1_000, outstandingCents: 1_000, status: 'sent', paidAt: null, dueDate: new Date('2025-02-20'), createdAt: new Date() },
      // d1_30: dueDate=2025-02-01 → 14 days past due
      { totalCents: 2_000, outstandingCents: 2_000, status: 'sent', paidAt: null, dueDate: new Date('2025-02-01'), createdAt: new Date() },
      // d31_60: dueDate=2025-01-10 → 36 days past due
      { totalCents: 3_000, outstandingCents: 3_000, status: 'sent', paidAt: null, dueDate: new Date('2025-01-10'), createdAt: new Date() },
      // excluded: outstandingCents = 0
      { totalCents: 4_000, outstandingCents: 0, status: 'paid', paidAt: new Date(), dueDate: new Date('2025-01-01'), createdAt: new Date() },
    ]
    const result = assembleOwnerAnalytics({ ...emptyRows, invoices }, period, asOf)
    expect(result.aging.current).toBe(1_000)
    expect(result.aging.d1_30).toBe(2_000)
    expect(result.aging.d31_60).toBe(3_000)
    expect(result.aging.d61_90).toBe(0)
    expect(result.aging.d90_plus).toBe(0)
  })

  it('always emits comingSoon.utilization as true', () => {
    expect(assembleOwnerAnalytics(emptyRows, period, asOf).comingSoon.utilization).toBe(true)
  })

  it('always emits comingSoon.jobCostMargin as true', () => {
    expect(assembleOwnerAnalytics(emptyRows, period, asOf).comingSoon.jobCostMargin).toBe(true)
  })
})
