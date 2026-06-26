import { describe, it, expect } from 'vitest'
import { formatCloseRate, agingTotal } from '@/lib/analytics-presenter'
import { formatCents } from '@/lib/format'

describe('formatCloseRate', () => {
  it('returns 0% when rate is 0 (sent=0 safe default)', () => {
    expect(formatCloseRate(0)).toBe('0%')
  })

  it('guards against NaN', () => {
    expect(formatCloseRate(NaN)).toBe('0%')
  })

  it('guards against Infinity', () => {
    expect(formatCloseRate(Infinity)).toBe('0%')
  })

  it('rounds to nearest percent (2/3 → 67%)', () => {
    expect(formatCloseRate(2 / 3)).toBe('67%')
  })

  it('returns 100% for a perfect close rate', () => {
    expect(formatCloseRate(1)).toBe('100%')
  })

  it('rounds 0.5 → 50%', () => {
    expect(formatCloseRate(0.5)).toBe('50%')
  })
})

describe('agingTotal', () => {
  it('sums all buckets', () => {
    expect(
      agingTotal({
        current: 1000,
        days1_30: 2000,
        days31_60: 3000,
        days61_90: 4000,
        days90plus: 5000,
      }),
    ).toBe(15000)
  })

  it('returns 0 for an all-zero aging object', () => {
    expect(
      agingTotal({ current: 0, days1_30: 0, days31_60: 0, days61_90: 0, days90plus: 0 }),
    ).toBe(0)
  })
})

describe('formatCents', () => {
  it('formats zero as $0.00 (empty-state guard)', () => {
    expect(formatCents(0)).toBe('$0.00')
  })

  it('formats non-zero cents correctly', () => {
    expect(formatCents(1050)).toBe('$10.50')
    expect(formatCents(100000)).toBe('$1000.00')
  })
})
