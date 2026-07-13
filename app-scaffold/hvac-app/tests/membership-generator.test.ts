import { describe, it, expect } from 'vitest'
import { calculateNextDueDate } from '@/lib/recurring-cadence'

// Use local-time constructor to match the local-time setMonth/setFullYear in calculateNextDueDate
const base = new Date(2024, 0, 15, 12, 0, 0) // Jan 15 2024 noon local

describe('calculateNextDueDate', () => {
  it('advances monthly by one month', () => {
    const result = calculateNextDueDate(base, 'monthly')
    expect(result.getFullYear()).toBe(2024)
    expect(result.getMonth()).toBe(1) // February (0-indexed)
    expect(result.getDate()).toBe(15)
  })

  it('advances quarterly by three months', () => {
    const result = calculateNextDueDate(base, 'quarterly')
    expect(result.getFullYear()).toBe(2024)
    expect(result.getMonth()).toBe(3) // April
    expect(result.getDate()).toBe(15)
  })

  it('advances biannual by six months', () => {
    const result = calculateNextDueDate(base, 'biannual')
    expect(result.getFullYear()).toBe(2024)
    expect(result.getMonth()).toBe(6) // July
    expect(result.getDate()).toBe(15)
  })

  it('annual bumps the year and preserves month/day', () => {
    const result = calculateNextDueDate(base, 'annual')
    expect(result.getFullYear()).toBe(2025)
    expect(result.getMonth()).toBe(0) // January
    expect(result.getDate()).toBe(15)
  })

  it('falls back to monthly for unknown frequency', () => {
    const result = calculateNextDueDate(base, 'weekly')
    expect(result.getMonth()).toBe(1) // February
  })

  it('does not mutate the input date', () => {
    const input = new Date(2024, 5, 1, 12, 0, 0) // June 1 2024
    const original = input.getTime()
    calculateNextDueDate(input, 'monthly')
    expect(input.getTime()).toBe(original)
  })
})
