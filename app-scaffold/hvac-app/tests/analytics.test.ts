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

const D = (iso: string) => new Date(iso)

// Helpers for concise row construction
function inv(overrides: Partial<InvoiceRow> = {}): InvoiceRow {
  return {
    totalCents: 10000,
    outstandingCents: 10000,
    status: 'open',
    paidAt: null,
    dueDate: null,
    createdAt: D('2026-01-01'),
    ...overrides,
  }
}

function pay(overrides: Partial<PaymentRow> = {}): PaymentRow {
  return { amountCents: 5000, paidAt: D('2026-03-15'), status: 'succeeded', ...overrides }
}

function est(overrides: Partial<EstimateRow> = {}): EstimateRow {
  return { status: 'sent', sentAt: D('2026-01-10'), ...overrides }
}

function job(overrides: Partial<JobRow> = {}): JobRow {
  return { status: 'completed', completedAt: D('2026-03-15'), ...overrides }
}

// ────────────────────────── revenueInRange ──────────────────────────

describe('revenueInRange', () => {
  const start = D('2026-03-01')
  const end = D('2026-04-01')

  it('returns 0 for empty array', () => {
    expect(revenueInRange([], start, end)).toBe(0)
  })

  it('includes payment on start boundary (inclusive)', () => {
    expect(revenueInRange([pay({ paidAt: start })], start, end)).toBe(5000)
  })

  it('excludes payment on end boundary (exclusive)', () => {
    expect(revenueInRange([pay({ paidAt: end })], start, end)).toBe(0)
  })

  it('excludes null-paidAt rows', () => {
    expect(revenueInRange([pay({ paidAt: null })], start, end)).toBe(0)
  })

  it('sums multiple in-range payments', () => {
    const payments = [
      pay({ amountCents: 1000, paidAt: D('2026-03-10') }),
      pay({ amountCents: 2000, paidAt: D('2026-03-20') }),
      pay({ amountCents: 500, paidAt: D('2026-02-28') }), // before range
    ]
    expect(revenueInRange(payments, start, end)).toBe(3000)
  })
})

// ────────────────────────── avgTicketCents ──────────────────────────

describe('avgTicketCents', () => {
  it('returns 0 for empty array', () => {
    expect(avgTicketCents([])).toBe(0)
    expect(isNaN(avgTicketCents([]))).toBe(false)
  })

  it('returns 0 when no paid invoices', () => {
    expect(avgTicketCents([inv({ status: 'open' })])).toBe(0)
  })

  it('returns totalCents for single paid invoice', () => {
    expect(avgTicketCents([inv({ status: 'paid', totalCents: 8000 })])).toBe(8000)
  })

  it('averages multiple paid invoices', () => {
    const invoices = [
      inv({ status: 'paid', totalCents: 6000 }),
      inv({ status: 'paid', totalCents: 10000 }),
      inv({ status: 'open', totalCents: 99999 }), // excluded
    ]
    expect(avgTicketCents(invoices)).toBe(8000)
  })
})

// ────────────────────────── arAgingBuckets ──────────────────────────

describe('arAgingBuckets', () => {
  const asOf = D('2026-04-01')
  const zeroBuckets = { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0 }

  it('returns zeroed buckets for empty array', () => {
    expect(arAgingBuckets([], asOf)).toEqual(zeroBuckets)
  })

  it('excludes paid/void/draft statuses', () => {
    const invoices = [
      inv({ status: 'paid', outstandingCents: 100, dueDate: D('2026-03-01') }),
      inv({ status: 'void', outstandingCents: 100, dueDate: D('2026-03-01') }),
      inv({ status: 'draft', outstandingCents: 100, dueDate: D('2026-03-01') }),
    ]
    expect(arAgingBuckets(invoices, asOf)).toEqual(zeroBuckets)
  })

  it('excludes rows with outstandingCents <= 0', () => {
    expect(arAgingBuckets([inv({ outstandingCents: 0 })], asOf)).toEqual(zeroBuckets)
  })

  it('null dueDate goes to current', () => {
    const result = arAgingBuckets([inv({ dueDate: null, outstandingCents: 500 })], asOf)
    expect(result.current).toBe(500)
  })

  it('exactly 0 days past due → current', () => {
    // asOf === dueDate → daysPast = 0 → current
    const result = arAgingBuckets([inv({ dueDate: asOf, outstandingCents: 100 })], asOf)
    expect(result.current).toBe(100)
  })

  it('1 day past due → d1_30', () => {
    const dueDate = D('2026-03-31') // 1 day before asOf
    const result = arAgingBuckets([inv({ dueDate, outstandingCents: 100 })], asOf)
    expect(result.d1_30).toBe(100)
  })

  it('30 days past due → d1_30', () => {
    const dueDate = D('2026-03-02') // 30 days before 2026-04-01
    const result = arAgingBuckets([inv({ dueDate, outstandingCents: 200 })], asOf)
    expect(result.d1_30).toBe(200)
  })

  it('31 days past due → d31_60', () => {
    const dueDate = D('2026-03-01') // 31 days before 2026-04-01
    const result = arAgingBuckets([inv({ dueDate, outstandingCents: 300 })], asOf)
    expect(result.d31_60).toBe(300)
  })

  it('60 days past due → d31_60', () => {
    const dueDate = D('2026-01-31') // 60 days before 2026-04-01
    const result = arAgingBuckets([inv({ dueDate, outstandingCents: 400 })], asOf)
    expect(result.d31_60).toBe(400)
  })

  it('61 days past due → d61_90', () => {
    const dueDate = D('2026-01-30') // 61 days before 2026-04-01
    const result = arAgingBuckets([inv({ dueDate, outstandingCents: 500 })], asOf)
    expect(result.d61_90).toBe(500)
  })

  it('90 days past due → d61_90', () => {
    const dueDate = D('2026-01-01') // 90 days before 2026-04-01
    const result = arAgingBuckets([inv({ dueDate, outstandingCents: 600 })], asOf)
    expect(result.d61_90).toBe(600)
  })

  it('91 days past due → d90_plus', () => {
    const dueDate = D('2025-12-31') // 91 days before 2026-04-01
    const result = arAgingBuckets([inv({ dueDate, outstandingCents: 700 })], asOf)
    expect(result.d90_plus).toBe(700)
  })
})

// ────────────────────────── closeRate ──────────────────────────

describe('closeRate', () => {
  it('returns 0 rate and 0 counts for empty array', () => {
    expect(closeRate([])).toEqual({ sent: 0, won: 0, rate: 0 })
  })

  it('returns 0 rate when sent===0 (no NaN)', () => {
    const result = closeRate([est({ status: 'draft', sentAt: null })])
    expect(result.sent).toBe(0)
    expect(result.rate).toBe(0)
    expect(isNaN(result.rate)).toBe(false)
  })

  it('counts sentAt!=null as sent regardless of status', () => {
    const estimates = [
      est({ status: 'sent', sentAt: D('2026-01-01') }),
      est({ status: 'declined', sentAt: D('2026-01-02') }),
      est({ status: 'draft', sentAt: null }), // not sent
    ]
    expect(closeRate(estimates).sent).toBe(2)
  })

  it('counts accepted as won', () => {
    const estimates = [
      est({ status: 'accepted', sentAt: D('2026-01-01') }),
      est({ status: 'sent', sentAt: D('2026-01-02') }),
    ]
    const result = closeRate(estimates)
    expect(result.won).toBe(1)
    expect(result.rate).toBe(0.5)
  })

  it('rate is 1.0 when all sent are accepted', () => {
    const estimates = [
      est({ status: 'accepted', sentAt: D('2026-01-01') }),
      est({ status: 'accepted', sentAt: D('2026-01-02') }),
    ]
    expect(closeRate(estimates).rate).toBe(1)
  })
})

// ────────────────────────── jobsCompletedInRange ──────────────────────────

describe('jobsCompletedInRange', () => {
  const start = D('2026-03-01')
  const end = D('2026-04-01')

  it('returns 0 for empty array', () => {
    expect(jobsCompletedInRange([], start, end)).toBe(0)
  })

  it('counts job on start boundary (inclusive)', () => {
    expect(jobsCompletedInRange([job({ completedAt: start })], start, end)).toBe(1)
  })

  it('excludes job on end boundary (exclusive)', () => {
    expect(jobsCompletedInRange([job({ completedAt: end })], start, end)).toBe(0)
  })

  it('excludes non-completed status', () => {
    expect(jobsCompletedInRange([job({ status: 'open', completedAt: D('2026-03-15') })], start, end)).toBe(0)
  })

  it('excludes null completedAt', () => {
    expect(jobsCompletedInRange([job({ completedAt: null })], start, end)).toBe(0)
  })
})

// ────────────────────────── totalOutstandingCents ──────────────────────────

describe('totalOutstandingCents', () => {
  it('returns 0 for empty array', () => {
    expect(totalOutstandingCents([])).toBe(0)
  })

  it('excludes paid/void/draft', () => {
    const invoices = [
      inv({ status: 'paid', outstandingCents: 1000 }),
      inv({ status: 'void', outstandingCents: 1000 }),
      inv({ status: 'draft', outstandingCents: 1000 }),
    ]
    expect(totalOutstandingCents(invoices)).toBe(0)
  })

  it('sums open invoices', () => {
    const invoices = [
      inv({ status: 'open', outstandingCents: 3000 }),
      inv({ status: 'overdue', outstandingCents: 7000 }),
      inv({ status: 'paid', outstandingCents: 99999 }),
    ]
    expect(totalOutstandingCents(invoices)).toBe(10000)
  })
})
