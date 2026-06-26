import { describe, it, expect } from 'vitest'
import { resolveDepositCents } from '@/lib/deposit'

describe('resolveDepositCents', () => {
  it('returns 50% of 100000 as 50000', () => {
    expect(resolveDepositCents({ depositType: 'percent', depositPercent: 50, totalCents: 100000 })).toBe(50000)
  })

  it('clamps fixed 25000 to totalCents 20000', () => {
    expect(resolveDepositCents({ depositType: 'fixed', depositFixedCents: 25000, totalCents: 20000 })).toBe(20000)
  })

  it('clamps 150% to totalCents', () => {
    expect(resolveDepositCents({ depositType: 'percent', depositPercent: 150, totalCents: 10000 })).toBe(10000)
  })

  it('returns 0 when depositType is null', () => {
    expect(resolveDepositCents({ depositType: null, totalCents: 50000 })).toBe(0)
  })

  it('returns 0 when depositType is undefined', () => {
    expect(resolveDepositCents({ depositType: undefined, totalCents: 50000 })).toBe(0)
  })

  it('returns 0 for negative percent', () => {
    expect(resolveDepositCents({ depositType: 'percent', depositPercent: -10, totalCents: 10000 })).toBe(0)
  })

  it('returns 0 for negative fixed amount', () => {
    expect(resolveDepositCents({ depositType: 'fixed', depositFixedCents: -500, totalCents: 10000 })).toBe(0)
  })

  it('returns 0 when depositPercent is missing', () => {
    expect(resolveDepositCents({ depositType: 'percent', totalCents: 10000 })).toBe(0)
  })

  it('returns 0 when depositFixedCents is missing', () => {
    expect(resolveDepositCents({ depositType: 'fixed', totalCents: 10000 })).toBe(0)
  })
})
