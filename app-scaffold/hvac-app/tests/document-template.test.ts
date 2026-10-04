import { describe, expect, it } from 'vitest'
import { templateTotals, validTemplateRate } from '../lib/document-template'

describe('public document template totals', () => {
  it('calculates the shown line totals before tax', () => {
    expect(templateTotals([{ description: 'Labor', quantity: 1.5, rate: 90 }, { description: 'Part', quantity: 1, rate: 85 }], 8.25)).toEqual({ amounts: [13500, 8500], subtotal: 22000, tax: 1815, total: 23815 })
  })
  it('rounds fractional cents per line so displayed amounts add up', () => {
    expect(templateTotals(Array.from({ length: 3 }, () => ({ description: 'Test', quantity: 0.5, rate: 0.01 })), 0)?.total).toBe(3)
  })
  it('rejects invalid numeric entries instead of showing a misleading total', () => {
    for (const quantity of [NaN, Infinity, -1, 10001]) expect(templateTotals([{ description: '', quantity, rate: 10 }], 0)).toBeNull()
    expect(templateTotals([], 101)).toBeNull()
    expect(templateTotals([{ description: '', quantity: 1, rate: -5 }], 0)).toBeNull()
    for (const rate of [NaN, Infinity, -Infinity, 1000000.01, 0.005, 12.345]) expect(templateTotals([{ description: '', quantity: 1, rate }], 0)).toBeNull()
    for (const tax of [NaN, Infinity, -1, 100.01]) expect(templateTotals([], tax)).toBeNull()
  })
  it('rejects fractional-cent rates rather than printing a different unit price', () => {
    expect(validTemplateRate(0.015)).toBe(false)
    expect(templateTotals([{ description: '', quantity: 2, rate: 0.015 }], 0)).toBeNull()
    for (const rate of [0, 0.01, 0.07, 32.19, 1234.56, 999999.99, 1000000]) expect(validTemplateRate(rate)).toBe(true)
  })
  it('rounds half-cent labor amounts and tax upward', () => {
    expect(templateTotals([{ description: '', quantity: 1.5, rate: 0.67 }], 0)?.subtotal).toBe(101)
    expect(templateTotals([{ description: '', quantity: 1, rate: 1 }], 0.5)?.tax).toBe(1)
  })
  it('keeps maximum supported totals within exact integer cents', () => {
    const lines = Array.from({ length: 30 }, () => ({ description: '', quantity: 10000, rate: 1000000 }))
    const result = templateTotals(lines, 100)!
    expect(result.subtotal).toBe(30000000000000)
    expect(result.total).toBe(60000000000000)
    expect(Number.isSafeInteger(result.total)).toBe(true)
    expect(templateTotals([...lines, lines[0]], 0)).toBeNull()
  })
  it('allows a blank zero-total template and no-tax documents', () => {
    expect(templateTotals([], 0)).toEqual({ amounts: [], subtotal: 0, tax: 0, total: 0 })
    expect(templateTotals([{ description: '', quantity: 1, rate: 0 }], 0)?.total).toBe(0)
  })
})
