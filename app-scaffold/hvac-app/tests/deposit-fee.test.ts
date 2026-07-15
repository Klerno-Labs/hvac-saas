import { describe, it, expect } from 'vitest'
import { computeDepositApplicationFeeCents } from '@/lib/deposit'

describe('computeDepositApplicationFeeCents', () => {
  it('returns 1450 for $500 deposit at 2.9%', () => {
    expect(computeDepositApplicationFeeCents(50000, 2.9)).toBe(1450)
  })

  it('returns 0 for zero deposit', () => {
    expect(computeDepositApplicationFeeCents(0, 2.9)).toBe(0)
  })

  it('returns 0 for negative deposit', () => {
    expect(computeDepositApplicationFeeCents(-100, 2.9)).toBe(0)
  })

  it('rounds half-up correctly', () => {
    // 100 cents * 0.5% = 0.5 → rounds to 1
    expect(computeDepositApplicationFeeCents(100, 0.5)).toBe(1)
  })

  it('applies a custom fee percent', () => {
    // 10000 cents * 5% = 500
    expect(computeDepositApplicationFeeCents(10000, 5)).toBe(500)
  })
})
