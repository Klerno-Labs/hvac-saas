import { describe, it, expect } from 'vitest'
import {
  revenueInRange,
  avgTicketCents,
  arAgingBuckets,
  closeRate,
  jobsCompletedInRange,
  totalOutstandingCents,
  type InvoiceRow,
  type PaymentRow,
  type EstimateRow,
  type JobRow,
} from '@/lib/analytics'

const DAY = 24 * 60 * 60 * 1000

const asOf = new Date('2024-04-01T00:00:00.000Z')

function daysAgo(n: number): Date {
  return new Date(asOf.getTime() - n * DAY)
}

function makeInvoice(overrides: Partial<InvoiceRow>): InvoiceRow {
  return {
    totalCents: 1000,
    outstandingCents: 1000,
    status: 'open',
    paidAt: null,
    dueDate: null,
    createdAt: asOf,
    ...overrides,
  }
}

// ─── revenueInRange ───────────────────────────────────────────────────────────

describe('revenueInRange', () => {
  const start = new Date('2024-03-01T00:00:00.000Z')
  const end = new Date('2024-04-01T00:00:00.000Z')

  it('returns 0 for empty array', () => {
    expect(revenueInRange([], start, end)).toBe(0)
  })

  it('sums payments with paidAt in [start, end)', () => {
    const payments: PaymentRow[] = [
      { amountCents: 500, paidAt: new Date('2024-03-15T00:00:00.000Z'), status: 'succeeded' },
      { amountCents: 300, paidAt: new Date('2024-03-31T23:59:59.999Z'), status: 'other' },
    ]
    expect(revenueInRange(payments, start, end)).toBe(800)
  })

  it('excludes payments where paidAt is null', () => {
    const payments: PaymentRow[] = [
      { amountCents: 999, paidAt: null, status: 'succeeded' },
    ]
    expect(revenueInRange(payments, start, end)).toBe(0)
  })

  it('is inclusive of start', () => {
    const payments: PaymentRow[] = [
      { amountCents: 100, paidAt: start, status: 'succeeded' },
    ]
    expect(revenueInRange(payments, start, end)).toBe(100)
  })

  it('is exclusive of end', () => {
    const payments: PaymentRow[] = [
      { amountCents: 100, paidAt: end, status: 'succeeded' },
    ]
    expect(revenueInRange(payments, start, end)).toBe(0)
  })

  it('excludes payments outside range', () => {
    const payments: PaymentRow[] = [
      { amountCents: 100, paidAt: new Date('2024-02-28T00:00:00.000Z'), status: 'succeeded' },
    ]
    expect(revenueInRange(payments, start, end)).toBe(0)
  })
})

// ─── avgTicketCents ───────────────────────────────────────────────────────────

describe('avgTicketCents', () => {
  it('returns 0 for empty array', () => {
    expect(avgTicketCents([])).toBe(0)
  })

  it('returns 0 when no paid invoices', () => {
    const invoices = [makeInvoice({ status: 'open' })]
    expect(avgTicketCents(invoices)).toBe(0)
  })

  it('averages totalCents of paid invoices only', () => {
    const invoices = [
      makeInvoice({ status: 'paid', totalCents: 200 }),
      makeInvoice({ status: 'paid', totalCents: 400 }),
      makeInvoice({ status: 'open', totalCents: 9999 }),
    ]
    expect(avgTicketCents(invoices)).toBe(300)
  })
})

// ─── arAgingBuckets ──────────────────────────────────────────────────────────

describe('arAgingBuckets', () => {
  it('returns zeroed buckets for empty array', () => {
    const result = arAgingBuckets([], asOf)
    expect(result).toEqual({ current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0 })
  })

  it('excludes paid, void, and draft invoices', () => {
    const invoices = [
      makeInvoice({ status: 'paid', outstandingCents: 100 }),
      makeInvoice({ status: 'void', outstandingCents: 100 }),
      makeInvoice({ status: 'draft', outstandingCents: 100 }),
    ]
    expect(arAgingBuckets(invoices, asOf)).toEqual({ current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0 })
  })

  it('excludes invoices with outstandingCents <= 0', () => {
    const invoices = [makeInvoice({ status: 'open', outstandingCents: 0 })]
    expect(arAgingBuckets(invoices, asOf)).toEqual({ current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0 })
  })

  it('puts null dueDate in current', () => {
    const invoices = [makeInvoice({ dueDate: null, outstandingCents: 50 })]
    expect(arAgingBuckets(invoices, asOf).current).toBe(50)
  })

  it('not-yet-due goes in current (0 days past)', () => {
    const invoices = [makeInvoice({ dueDate: asOf, outstandingCents: 10 })]
    expect(arAgingBuckets(invoices, asOf).current).toBe(10)
  })

  it('1 day past due → d1_30', () => {
    const invoices = [makeInvoice({ dueDate: daysAgo(1), outstandingCents: 10 })]
    const r = arAgingBuckets(invoices, asOf)
    expect(r.d1_30).toBe(10)
    expect(r.current).toBe(0)
  })

  it('30 days past due → d1_30', () => {
    const invoices = [makeInvoice({ dueDate: daysAgo(30), outstandingCents: 10 })]
    expect(arAgingBuckets(invoices, asOf).d1_30).toBe(10)
  })

  it('31 days past due → d31_60', () => {
    const invoices = [makeInvoice({ dueDate: daysAgo(31), outstandingCents: 10 })]
    expect(arAgingBuckets(invoices, asOf).d31_60).toBe(10)
  })

  it('60 days past due → d31_60', () => {
    const invoices = [makeInvoice({ dueDate: daysAgo(60), outstandingCents: 10 })]
    expect(arAgingBuckets(invoices, asOf).d31_60).toBe(10)
  })

  it('61 days past due → d61_90', () => {
    const invoices = [makeInvoice({ dueDate: daysAgo(61), outstandingCents: 10 })]
    expect(arAgingBuckets(invoices, asOf).d61_90).toBe(10)
  })

  it('90 days past due → d61_90', () => {
    const invoices = [makeInvoice({ dueDate: daysAgo(90), outstandingCents: 10 })]
    expect(arAgingBuckets(invoices, asOf).d61_90).toBe(10)
  })

  it('91 days past due → d90_plus', () => {
    const invoices = [makeInvoice({ dueDate: daysAgo(91), outstandingCents: 10 })]
    expect(arAgingBuckets(invoices, asOf).d90_plus).toBe(10)
  })
})

// ─── closeRate ───────────────────────────────────────────────────────────────

describe('closeRate', () => {
  it('returns 0 rate when no estimates', () => {
    expect(closeRate([])).toEqual({ sent: 0, won: 0, rate: 0 })
  })

  it('returns 0 rate when sent is 0', () => {
    const estimates: EstimateRow[] = [{ status: 'draft', sentAt: null }]
    expect(closeRate(estimates)).toEqual({ sent: 0, won: 0, rate: 0 })
  })

  it('counts sent by sentAt != null', () => {
    const estimates: EstimateRow[] = [
      { status: 'sent', sentAt: new Date() },
      { status: 'accepted', sentAt: new Date() },
      { status: 'draft', sentAt: null },
    ]
    const r = closeRate(estimates)
    expect(r.sent).toBe(2)
    expect(r.won).toBe(1)
    expect(r.rate).toBeCloseTo(0.5)
  })

  it('100% close rate', () => {
    const estimates: EstimateRow[] = [
      { status: 'accepted', sentAt: new Date() },
      { status: 'accepted', sentAt: new Date() },
    ]
    expect(closeRate(estimates).rate).toBe(1)
  })
})

// ─── jobsCompletedInRange ─────────────────────────────────────────────────────

describe('jobsCompletedInRange', () => {
  const start = new Date('2024-03-01T00:00:00.000Z')
  const end = new Date('2024-04-01T00:00:00.000Z')

  it('returns 0 for empty array', () => {
    expect(jobsCompletedInRange([], start, end)).toBe(0)
  })

  it('counts completed jobs with completedAt in [start, end)', () => {
    const jobs: JobRow[] = [
      { status: 'completed', completedAt: new Date('2024-03-15T00:00:00.000Z') },
      { status: 'completed', completedAt: new Date('2024-03-31T23:59:59.999Z') },
      { status: 'open', completedAt: new Date('2024-03-15T00:00:00.000Z') },
    ]
    expect(jobsCompletedInRange(jobs, start, end)).toBe(2)
  })

  it('is inclusive of start', () => {
    const jobs: JobRow[] = [{ status: 'completed', completedAt: start }]
    expect(jobsCompletedInRange(jobs, start, end)).toBe(1)
  })

  it('is exclusive of end', () => {
    const jobs: JobRow[] = [{ status: 'completed', completedAt: end }]
    expect(jobsCompletedInRange(jobs, start, end)).toBe(0)
  })

  it('ignores completed jobs with null completedAt', () => {
    const jobs: JobRow[] = [{ status: 'completed', completedAt: null }]
    expect(jobsCompletedInRange(jobs, start, end)).toBe(0)
  })
})

// ─── totalOutstandingCents ───────────────────────────────────────────────────

describe('totalOutstandingCents', () => {
  it('returns 0 for empty array', () => {
    expect(totalOutstandingCents([])).toBe(0)
  })

  it('excludes paid, void, draft', () => {
    const invoices = [
      makeInvoice({ status: 'paid', outstandingCents: 500 }),
      makeInvoice({ status: 'void', outstandingCents: 500 }),
      makeInvoice({ status: 'draft', outstandingCents: 500 }),
    ]
    expect(totalOutstandingCents(invoices)).toBe(0)
  })

  it('sums non-excluded invoices', () => {
    const invoices = [
      makeInvoice({ status: 'open', outstandingCents: 300 }),
      makeInvoice({ status: 'overdue', outstandingCents: 200 }),
      makeInvoice({ status: 'paid', outstandingCents: 9999 }),
    ]
    expect(totalOutstandingCents(invoices)).toBe(500)
  })
})
