import { describe, it, expect } from 'vitest'
import { formatDepositLabel } from '@/lib/deposit'

describe('formatDepositLabel', () => {
  it('returns deposit due label for required status', () => {
    expect(formatDepositLabel(50000, 'required')).toBe('Deposit due on approval: $500.00')
  })

  it('returns paid label for paid status', () => {
    expect(formatDepositLabel(50000, 'paid')).toBe('Deposit paid')
  })

  it('returns empty string when amount is 0', () => {
    expect(formatDepositLabel(0, 'required')).toBe('')
  })

  it('returns empty string when amount is null', () => {
    expect(formatDepositLabel(null, 'required')).toBe('')
  })

  it('returns empty string when amount is undefined', () => {
    expect(formatDepositLabel(undefined, 'required')).toBe('')
  })
})
