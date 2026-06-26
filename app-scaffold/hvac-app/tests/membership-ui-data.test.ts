import { describe, it, expect } from 'vitest'
import { visitsLabel, planPriceLabel, cadenceLabel } from '@/lib/membership-formatters'

describe('visitsLabel', () => {
  it('formats normal usage', () => {
    expect(visitsLabel(2, 4)).toBe('2 / 4 visits used')
  })
  it('formats zero used', () => {
    expect(visitsLabel(0, 12)).toBe('0 / 12 visits used')
  })
  it('formats fully used', () => {
    expect(visitsLabel(4, 4)).toBe('4 / 4 visits used')
  })
  it('formats single visit plan', () => {
    expect(visitsLabel(0, 1)).toBe('0 / 1 visits used')
  })
})

describe('planPriceLabel', () => {
  it('formats typical price', () => {
    expect(planPriceLabel(4999)).toBe('$49.99')
  })
  it('formats round dollars', () => {
    expect(planPriceLabel(10000)).toBe('$100.00')
  })
  it('formats zero', () => {
    expect(planPriceLabel(0)).toBe('$0.00')
  })
  it('formats one cent', () => {
    expect(planPriceLabel(1)).toBe('$0.01')
  })
})

describe('cadenceLabel', () => {
  it('formats monthly', () => {
    expect(cadenceLabel('monthly')).toBe('Monthly')
  })
  it('formats quarterly', () => {
    expect(cadenceLabel('quarterly')).toBe('Quarterly')
  })
  it('formats biannual', () => {
    expect(cadenceLabel('biannual')).toBe('Biannual')
  })
  it('formats annual', () => {
    expect(cadenceLabel('annual')).toBe('Annual')
  })
  it('passes through unknown values', () => {
    expect(cadenceLabel('weekly')).toBe('weekly')
  })
})
