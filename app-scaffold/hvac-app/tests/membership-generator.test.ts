import { describe, it, expect } from 'vitest'
import { calculateNextDueDate } from '@/lib/recurring-cadence'

describe('calculateNextDueDate', () => {
  it('advances monthly by 1 month', () => {
    const next = calculateNextDueDate(new Date('2024-01-15'), 'monthly')
    expect(next.getFullYear()).toBe(2024)
    expect(next.getMonth()).toBe(1)
    expect(next.getDate()).toBe(15)
  })

  it('advances quarterly by 3 months', () => {
    const next = calculateNextDueDate(new Date('2024-01-15'), 'quarterly')
    expect(next.getMonth()).toBe(3)
  })

  it('advances biannual by 6 months', () => {
    const next = calculateNextDueDate(new Date('2024-01-15'), 'biannual')
    expect(next.getMonth()).toBe(6)
  })

  it('advances annual by bumping the year', () => {
    const next = calculateNextDueDate(new Date('2024-03-10'), 'annual')
    expect(next.getFullYear()).toBe(2025)
    expect(next.getMonth()).toBe(2)
    expect(next.getDate()).toBe(10)
  })

  it('does not mutate the input date', () => {
    const current = new Date('2024-06-01')
    const original = current.getTime()
    calculateNextDueDate(current, 'monthly')
    expect(current.getTime()).toBe(original)
  })

  it('defaults to monthly for unknown frequency', () => {
    const next = calculateNextDueDate(new Date('2024-01-15'), 'weekly')
    expect(next.getMonth()).toBe(1)
  })
})
