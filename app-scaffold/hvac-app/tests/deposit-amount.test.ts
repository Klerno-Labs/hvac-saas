import { describe, it, expect } from 'vitest'
import { resolveDepositCents } from '@/lib/deposit'

describe('resolveDepositCents', () => {
  it('50% of 100000 = 50000', () => {
    expect(resolveDepositCents({ depositType: 'percent', depositPercent: 50, totalCents: 100000 })).toBe(50000)
  })

  it('fixed 25000 on 20000 total clamps to 20000', () => {
    expect(resolveDepositCents({ depositType: 'fixed', depositFixedCents: 25000, totalCents: 20000 })).toBe(20000)
  })

  it('150% clamps to total', () => {
    expect(resolveDepositCents({ depositType: 'percent', depositPercent: 150, totalCents: 100000 })).toBe(100000)
  })

  it('null type returns 0', () => {
    expect(resolveDepositCents({ depositType: null, totalCents: 100000 })).toBe(0)
  })

  it('undefined type returns 0', () => {
    expect(resolveDepositCents({ depositType: undefined, totalCents: 100000 })).toBe(0)
  })

  it('negative percent returns 0', () => {
    expect(resolveDepositCents({ depositType: 'percent', depositPercent: -10, totalCents: 100000 })).toBe(0)
  })

  it('negative fixed returns 0', () => {
    expect(resolveDepositCents({ depositType: 'fixed', depositFixedCents: -500, totalCents: 100000 })).toBe(0)
  })
})
