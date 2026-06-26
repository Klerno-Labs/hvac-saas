import { describe, it, expect } from 'vitest'
import { resolvePeriod } from '@/lib/period'

// Fixed reference point: 2024-07-15T15:30:00.000Z (mid-July, Q3, UTC)
const NOW = new Date('2024-07-15T15:30:00.000Z')

describe('resolvePeriod', () => {
  it('month: start is first of current month, end is now', () => {
    const { start, end } = resolvePeriod('month', NOW)
    expect(end).toEqual(NOW)
    expect(start <= end).toBe(true)
    // UTC month: July 1 00:00:00 UTC
    expect(start.toISOString()).toBe('2024-07-01T00:00:00.000Z')
  })

  it('quarter: start is first of current quarter (Q3 = Jul 1), end is now', () => {
    const { start, end } = resolvePeriod('quarter', NOW)
    expect(end).toEqual(NOW)
    expect(start <= end).toBe(true)
    expect(start.toISOString()).toBe('2024-07-01T00:00:00.000Z')
  })

  it('ytd: start is Jan 1 of current year, end is now', () => {
    const { start, end } = resolvePeriod('ytd', NOW)
    expect(end).toEqual(NOW)
    expect(start <= end).toBe(true)
    expect(start.toISOString()).toBe('2024-01-01T00:00:00.000Z')
  })

  it('last30: start is exactly 30 days before now, end is now', () => {
    const { start, end } = resolvePeriod('last30', NOW)
    expect(end).toEqual(NOW)
    expect(start <= end).toBe(true)
    const diffMs = end.getTime() - start.getTime()
    expect(diffMs).toBe(30 * 24 * 60 * 60 * 1000)
  })

  it('unknown value defaults to month, does not throw', () => {
    expect(() => resolvePeriod('bogus', NOW)).not.toThrow()
    const { start } = resolvePeriod('bogus', NOW)
    const { start: monthStart } = resolvePeriod('month', NOW)
    expect(start.toISOString()).toBe(monthStart.toISOString())
  })

  it('empty string defaults to month, does not throw', () => {
    expect(() => resolvePeriod('', NOW)).not.toThrow()
    const { start } = resolvePeriod('', NOW)
    const { start: monthStart } = resolvePeriod('month', NOW)
    expect(start.toISOString()).toBe(monthStart.toISOString())
  })

  it('quarter: Q1 (Jan ref) starts Jan 1', () => {
    const q1Now = new Date('2024-02-20T10:00:00.000Z')
    const { start } = resolvePeriod('quarter', q1Now)
    expect(start.toISOString()).toBe('2024-01-01T00:00:00.000Z')
  })

  it('quarter: Q4 (Nov ref) starts Oct 1', () => {
    const q4Now = new Date('2024-11-05T10:00:00.000Z')
    const { start } = resolvePeriod('quarter', q4Now)
    expect(start.toISOString()).toBe('2024-10-01T00:00:00.000Z')
  })

  it('with timezone: month boundary shifts for America/New_York (UTC-4 in July)', () => {
    // July 15 15:30 UTC = July 15 11:30 AM in New York (EDT, UTC-4)
    // Month start in New York = July 1 00:00 EDT = July 1 04:00 UTC
    const { start } = resolvePeriod('month', NOW, 'America/New_York')
    expect(start.toISOString()).toBe('2024-07-01T04:00:00.000Z')
  })

  it('start <= end invariant holds for all periods with timezone', () => {
    const periods = ['month', 'quarter', 'ytd', 'last30', 'unknown']
    for (const p of periods) {
      const { start, end } = resolvePeriod(p, NOW, 'America/Chicago')
      expect(start <= end).toBe(true)
    }
  })
})
