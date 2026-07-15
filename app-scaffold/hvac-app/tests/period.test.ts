import { describe, it, expect } from 'vitest'
import { resolvePeriod } from '@/lib/period'

// Fixed reference point: 2025-06-15 14:30:00 UTC (Sunday, mid-month, Q2)
const NOW = new Date('2025-06-15T14:30:00Z')

describe('resolvePeriod', () => {
  describe('month (UTC)', () => {
    it('start is June 1 00:00 UTC', () => {
      const { start, end } = resolvePeriod('month', NOW)
      expect(start.toISOString()).toBe('2025-06-01T00:00:00.000Z')
      expect(end).toBe(NOW)
    })

    it('start <= end', () => {
      const { start, end } = resolvePeriod('month', NOW)
      expect(start.getTime()).toBeLessThanOrEqual(end.getTime())
    })
  })

  describe('quarter (UTC)', () => {
    it('start is April 1 00:00 UTC (Q2)', () => {
      const { start, end } = resolvePeriod('quarter', NOW)
      expect(start.toISOString()).toBe('2025-04-01T00:00:00.000Z')
      expect(end).toBe(NOW)
    })

    it('Q1 (Feb) starts Jan 1', () => {
      const feb = new Date('2025-02-10T10:00:00Z')
      const { start } = resolvePeriod('quarter', feb)
      expect(start.toISOString()).toBe('2025-01-01T00:00:00.000Z')
    })

    it('Q3 (Aug) starts Jul 1', () => {
      const aug = new Date('2025-08-20T10:00:00Z')
      const { start } = resolvePeriod('quarter', aug)
      expect(start.toISOString()).toBe('2025-07-01T00:00:00.000Z')
    })
  })

  describe('ytd (UTC)', () => {
    it('start is Jan 1 00:00 UTC', () => {
      const { start, end } = resolvePeriod('ytd', NOW)
      expect(start.toISOString()).toBe('2025-01-01T00:00:00.000Z')
      expect(end).toBe(NOW)
    })
  })

  describe('last30', () => {
    it('start is exactly 30 days before now', () => {
      const { start, end } = resolvePeriod('last30', NOW)
      expect(start.getTime()).toBe(NOW.getTime() - 30 * 24 * 60 * 60 * 1000)
      expect(end).toBe(NOW)
    })

    it('start <= end', () => {
      const { start, end } = resolvePeriod('last30', NOW)
      expect(start.getTime()).toBeLessThanOrEqual(end.getTime())
    })
  })

  describe('unknown value', () => {
    it('defaults to month, never throws', () => {
      const { start, end } = resolvePeriod('bogus', NOW)
      expect(start.toISOString()).toBe('2025-06-01T00:00:00.000Z')
      expect(end).toBe(NOW)
    })

    it('empty string defaults to month', () => {
      const { start } = resolvePeriod('', NOW)
      expect(start.toISOString()).toBe('2025-06-01T00:00:00.000Z')
    })
  })

  describe('timezone-aware boundaries', () => {
    it('month start in America/New_York (EDT, UTC-4) is June 1 04:00 UTC', () => {
      // NOW = Jun 15 14:30 UTC = Jun 15 10:30 EDT → local month is June
      // Jun 1 00:00 EDT = Jun 1 04:00 UTC
      const { start } = resolvePeriod('month', NOW, 'America/New_York')
      expect(start.toISOString()).toBe('2025-06-01T04:00:00.000Z')
    })

    it('ytd start in Asia/Kolkata (IST, UTC+5:30) is Jan 1 previous night UTC', () => {
      // Jan 1 00:00 IST = Dec 31 18:30 UTC
      const { start } = resolvePeriod('ytd', NOW, 'Asia/Kolkata')
      expect(start.toISOString()).toBe('2024-12-31T18:30:00.000Z')
    })

    it('start <= end for any timezone', () => {
      for (const tz of ['America/Los_Angeles', 'Europe/London', 'Asia/Tokyo']) {
        const { start, end } = resolvePeriod('month', NOW, tz)
        expect(start.getTime()).toBeLessThanOrEqual(end.getTime())
      }
    })
  })
})
