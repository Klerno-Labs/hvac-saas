import { describe, it, expect } from 'vitest'
import { computeDepositApplicationFeeCents } from '@/lib/deposit'

describe('computeDepositApplicationFeeCents', () => {
  it('computes 2.9% of 50000 as 1450', () => {
    expect(computeDepositApplicationFeeCents(50000, 2.9)).toBe(1450)
  })

  it('returns 0 for zero deposit', () => {
    expect(computeDepositApplicationFeeCents(0, 2.9)).toBe(0)
  })

  it('returns 0 for negative deposit', () => {
    expect(computeDepositApplicationFeeCents(-100, 2.9)).toBe(0)
  })

  it('rounds fractional cents (172 * 2.9% = 4.988 → 5)', () => {
    expect(computeDepositApplicationFeeCents(172, 2.9)).toBe(5)
  })

  it('uses provided feePercent instead of hardcoded 2.9', () => {
    expect(computeDepositApplicationFeeCents(10000, 5.0)).toBe(500)
  })

  it('feeds depositAmountCents correctly at default platform rate', () => {
    const depositAmountCents = 25000
    const platformFeePercent = 2.9
    const fee = computeDepositApplicationFeeCents(depositAmountCents, platformFeePercent)
    expect(fee).toBe(725)
  })
})
