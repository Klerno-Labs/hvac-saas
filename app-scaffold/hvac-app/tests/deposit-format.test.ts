import { describe, it, expect } from 'vitest'
import { formatDepositLabel } from '@/lib/deposit'

describe('formatDepositLabel', () => {
  it('returns deposit due label with formatted amount', () => {
    expect(formatDepositLabel(50000, 'required')).toBe('Deposit due on approval: $500.00')
  })

  it('returns paid label when status is paid', () => {
    expect(formatDepositLabel(50000, 'paid')).toBe('Deposit paid')
  })

  it('returns empty string when amount is 0', () => {
    expect(formatDepositLabel(0, 'required')).toBe('')
  })

  it('returns empty string when amount is 0 regardless of status', () => {
    expect(formatDepositLabel(0, 'paid')).toBe('')
  })

  it('formats fractional cents correctly', () => {
    expect(formatDepositLabel(10000, null)).toBe('Deposit due on approval: $100.00')
  })
})
