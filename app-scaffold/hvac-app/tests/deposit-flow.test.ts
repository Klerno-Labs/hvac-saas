import { describe, it, expect } from 'vitest'
import { resolveDepositCents, computeDepositApplicationFeeCents, formatDepositLabel } from '@/lib/deposit'

describe('deposit flow chain', () => {
  const FEE_PERCENT = 2.9

  describe('percent deposit type', () => {
    const totalCents = 20000 // $200.00
    const depositPercent = 0.5 // 50%

    it('resolves correct deposit amount', () => {
      const depositCents = resolveDepositCents(totalCents, 'percent', depositPercent, null)
      expect(depositCents).toBe(10000) // $100.00
    })

    it('computes correct application fee', () => {
      const depositCents = resolveDepositCents(totalCents, 'percent', depositPercent, null)
      const fee = computeDepositApplicationFeeCents(depositCents, FEE_PERCENT)
      expect(fee).toBe(290) // $2.90
    })

    it('produces consistent label', () => {
      const depositCents = resolveDepositCents(totalCents, 'percent', depositPercent, null)
      const label = formatDepositLabel(true, 'pending', null, depositCents)
      expect(label).toBe('Deposit due on approval: $100.00')
    })
  })

  describe('fixed deposit type', () => {
    const totalCents = 50000 // $500.00
    const depositFixedCents = 5000 // $50.00

    it('resolves correct deposit amount', () => {
      const depositCents = resolveDepositCents(totalCents, 'fixed', null, depositFixedCents)
      expect(depositCents).toBe(5000)
    })

    it('computes correct application fee', () => {
      const depositCents = resolveDepositCents(totalCents, 'fixed', null, depositFixedCents)
      const fee = computeDepositApplicationFeeCents(depositCents, FEE_PERCENT)
      expect(fee).toBe(145) // $1.45
    })

    it('produces consistent label', () => {
      const depositCents = resolveDepositCents(totalCents, 'fixed', null, depositFixedCents)
      const label = formatDepositLabel(true, 'pending', null, depositCents)
      expect(label).toBe('Deposit due on approval: $50.00')
    })
  })

  describe('no deposit configured', () => {
    it('resolves zero when depositType is null', () => {
      expect(resolveDepositCents(20000, null, null, null)).toBe(0)
    })

    it('fee is zero on zero deposit', () => {
      expect(computeDepositApplicationFeeCents(0, FEE_PERCENT)).toBe(0)
    })

    it('label is null when not required', () => {
      expect(formatDepositLabel(false, 'pending', null, 0)).toBeNull()
    })
  })
})
