import { describe, it, expect } from 'vitest'
import { formatDepositLabel } from '@/lib/deposit'

describe('formatDepositLabel', () => {
  it('returns null when deposit is not required', () => {
    expect(formatDepositLabel(false, 'pending', null, 5000)).toBeNull()
  })

  it('returns due label when required and not yet paid', () => {
    const label = formatDepositLabel(true, 'pending', null, 5000)
    expect(label).toBe('Deposit due on approval: $50.00')
  })

  it('returns paid label with date when deposit is paid', () => {
    const paidAt = new Date('2026-03-15')
    const label = formatDepositLabel(true, 'paid', paidAt, 5000)
    expect(label).toContain('Deposit paid on')
    expect(label).toContain('2026')
  })

  it('treats required+paid but no paidAt as still pending', () => {
    const label = formatDepositLabel(true, 'paid', null, 10000)
    expect(label).toBe('Deposit due on approval: $100.00')
  })
})
