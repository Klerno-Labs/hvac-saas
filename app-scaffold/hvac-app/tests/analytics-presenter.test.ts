import { describe, it, expect } from 'vitest'
import { formatCloseRate, agingTotal } from '@/lib/analytics-presenter'

describe('formatCloseRate', () => {
  it('returns 0% when sent is 0 (NaN guard)', () => {
    expect(formatCloseRate(0, 0)).toBe('0%')
  })

  it('rounds 2/3 to 67%', () => {
    expect(formatCloseRate(3, 2)).toBe('67%')
  })

  it('returns 100% when all sent are won', () => {
    expect(formatCloseRate(5, 5)).toBe('100%')
  })

  it('returns 0% when sent is non-zero and won is 0', () => {
    expect(formatCloseRate(10, 0)).toBe('0%')
  })
})

describe('agingTotal', () => {
  it('sums all five aging buckets', () => {
    expect(
      agingTotal({
        currentCents: 10000,
        days1to30Cents: 5000,
        days31to60Cents: 2000,
        days61to90Cents: 1000,
        days90plusCents: 500,
      }),
    ).toBe(18500)
  })

  it('returns 0 when all buckets are empty ($0 empty case)', () => {
    expect(
      agingTotal({
        currentCents: 0,
        days1to30Cents: 0,
        days31to60Cents: 0,
        days61to90Cents: 0,
        days90plusCents: 0,
      }),
    ).toBe(0)
  })
})
