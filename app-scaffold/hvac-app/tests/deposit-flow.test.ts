import { describe, it, expect } from 'vitest'
import { resolveDepositCents, computeDepositApplicationFeeCents, formatDepositLabel } from '@/lib/deposit'

describe('EPIC 19 deposit chain — percent case', () => {
  const estimate = {
    totalCents: 500000,        // $5,000.00
    depositType: 'percent' as const,
    depositPercent: 25,        // 25%
    depositFixedCents: null,
  }

  it('resolveDepositCents computes 25% of total', () => {
    expect(resolveDepositCents(estimate)).toBe(125000)  // $1,250.00
  })

  it('computeDepositApplicationFeeCents applies default 2.9% fee', () => {
    const depositCents = resolveDepositCents(estimate)
    expect(computeDepositApplicationFeeCents(depositCents)).toBe(3625)  // $36.25
  })

  it('formatDepositLabel produces consistent label for unpaid deposit', () => {
    const depositCents = resolveDepositCents(estimate)
    const label = formatDepositLabel({
      depositRequired: true,
      depositCents,
      depositStatus: 'pending',
      depositPaidAt: null,
    })
    expect(label).toBe('Deposit due on approval: $1250.00')
  })

  it('chain is internally consistent: amount → fee → label reference same cents', () => {
    const amount = resolveDepositCents(estimate)
    const fee = computeDepositApplicationFeeCents(amount)
    const label = formatDepositLabel({ depositRequired: true, depositCents: amount, depositStatus: null, depositPaidAt: null })

    expect(amount).toBeGreaterThan(0)
    expect(fee).toBeLessThan(amount)
    expect(label).toContain('$' + (amount / 100).toFixed(2))
  })
})

describe('EPIC 19 deposit chain — fixed case', () => {
  const estimate = {
    totalCents: 800000,        // $8,000.00
    depositType: 'fixed' as const,
    depositPercent: null,
    depositFixedCents: 200000, // $2,000.00 fixed
  }

  it('resolveDepositCents returns fixed amount directly', () => {
    expect(resolveDepositCents(estimate)).toBe(200000)
  })

  it('computeDepositApplicationFeeCents is proportional to fixed deposit', () => {
    const depositCents = resolveDepositCents(estimate)
    expect(computeDepositApplicationFeeCents(depositCents)).toBe(5800)  // $58.00
  })

  it('formatDepositLabel labels fixed deposit correctly', () => {
    const depositCents = resolveDepositCents(estimate)
    const label = formatDepositLabel({
      depositRequired: true,
      depositCents,
      depositStatus: 'pending',
      depositPaidAt: null,
    })
    expect(label).toBe('Deposit due on approval: $2000.00')
  })
})

describe('EPIC 19 deposit chain — no deposit', () => {
  const estimate = {
    totalCents: 300000,
    depositType: null,
    depositPercent: null,
    depositFixedCents: null,
  }

  it('resolveDepositCents returns 0 with no deposit type', () => {
    expect(resolveDepositCents(estimate)).toBe(0)
  })

  it('formatDepositLabel returns null when depositRequired is false', () => {
    expect(
      formatDepositLabel({ depositRequired: false, depositCents: 0, depositStatus: null, depositPaidAt: null }),
    ).toBeNull()
  })
})
