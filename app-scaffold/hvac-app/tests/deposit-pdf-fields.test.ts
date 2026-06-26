import { describe, it, expect } from 'vitest'
import { formatDepositLabel } from '@/lib/deposit'

describe('formatDepositLabel', () => {
  it('returns null when depositRequired is false', () => {
    expect(
      formatDepositLabel({ depositRequired: false, depositCents: 50000, depositStatus: null, depositPaidAt: null }),
    ).toBeNull()
  })

  it('returns due-on-approval label when required and unpaid', () => {
    const label = formatDepositLabel({
      depositRequired: true,
      depositCents: 25000,
      depositStatus: 'pending',
      depositPaidAt: null,
    })
    expect(label).toBe('Deposit due on approval: $250.00')
  })

  it('returns paid label when depositStatus is paid', () => {
    const paidAt = new Date('2025-03-15T00:00:00.000Z')
    const label = formatDepositLabel({
      depositRequired: true,
      depositCents: 25000,
      depositStatus: 'paid',
      depositPaidAt: paidAt,
    })
    expect(label).toMatch(/^Deposit paid on /)
    expect(label).toContain('2025')
  })

  it('returns due-on-approval when status is paid but paidAt is missing', () => {
    const label = formatDepositLabel({
      depositRequired: true,
      depositCents: 10000,
      depositStatus: 'paid',
      depositPaidAt: null,
    })
    expect(label).toBe('Deposit due on approval: $100.00')
  })
})
