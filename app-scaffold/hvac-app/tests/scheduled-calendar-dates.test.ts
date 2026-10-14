import { describe, expect, it } from 'vitest'
import { formatDateOnly, isDueDatePast, resolveBusinessTimeZone, startOfBusinessDayAsUtcDate } from '@/lib/format'
import { createJobSchema } from '@/lib/validations/job'

describe('business calendar dates', () => {
  it.each([
    ['America/Chicago', '2026-09-27T02:00:00Z', '2026-09-26'],
    ['America/Chicago', '2026-09-27T05:00:00Z', '2026-09-27'],
    ['America/New_York', '2026-03-08T06:30:00Z', '2026-03-08'],
    ['America/New_York', '2026-03-08T07:30:00Z', '2026-03-08'],
    ['Pacific/Honolulu', '2026-01-01T03:00:00Z', '2025-12-31'],
    ['Pacific/Kiritimati', '2026-09-26T12:00:00Z', '2026-09-27'],
    ['invalid-timezone', '2026-09-27T02:00:00Z', '2026-09-27'],
  ])('uses the business day for %s at %s', (zone, now, expected) => {
    expect(startOfBusinessDayAsUtcDate(new Date(now), zone).toISOString()).toBe(`${expected}T00:00:00.000Z`)
  })
  it.each([null, undefined, '', 'not/a-zone'])('uses UTC for missing or invalid zone %s', zone => {
    expect(resolveBusinessTimeZone(zone)).toBe('UTC')
  })
  it('does not mark Chicago invoices overdue when UTC has moved to tomorrow', () => {
    expect(isDueDatePast('2026-09-26', new Date('2026-09-27T02:00:00Z'), 'America/Chicago')).toBe(false)
    expect(isDueDatePast('2026-09-26', new Date('2026-09-27T05:00:00Z'), 'America/Chicago')).toBe(true)
  })
  it('displays the selected schedule day without interpreting midnight as an appointment time', () => {
    const previous = process.env.TZ
    try {
      process.env.TZ = 'America/Los_Angeles'
      expect(formatDateOnly(new Date('2026-09-26T00:00:00Z'))).toBe('Sep 26, 2026')
    } finally { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous }
  })
})

describe('scheduled date input validation', () => {
  const job = { customerId: 'customer1', title: 'Inspection' }
  it.each(['2026-02-30', '2026-13-01', '2026-09-26T08:30', '2026-09-26T08:30:00-05:00', 'not-a-date'])('rejects invalid or time-bearing schedule %s', scheduledFor => {
    expect(createJobSchema.safeParse({ ...job, scheduledFor }).success).toBe(false)
  })
  it('accepts a real leap-day date', () => {
    expect(createJobSchema.safeParse({ ...job, scheduledFor: '2028-02-29' }).success).toBe(true)
  })
  it('keeps unscheduled work valid', () => {
    expect(createJobSchema.safeParse(job).success).toBe(true)
    expect(createJobSchema.safeParse({ ...job, scheduledFor: '' }).success).toBe(true)
  })
})
