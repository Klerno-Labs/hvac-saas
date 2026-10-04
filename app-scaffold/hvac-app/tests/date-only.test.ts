import { describe, expect, it } from 'vitest'
import { formatDateOnly, isDueDatePast } from '@/lib/format'
describe('calendar due dates', () => {
  it('displays the stored calendar day independently of host time zone', () => {
    const previous = process.env.TZ
    try {
      process.env.TZ = 'America/Chicago'
      expect(formatDateOnly(new Date('2026-09-26T00:00:00Z'))).toBe('Sep 26, 2026')
    } finally { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous }
  })
  it('does not call an invoice overdue during its due day', () => {
    expect(isDueDatePast('2026-09-26', new Date('2026-09-26T23:59:59Z'))).toBe(false)
    expect(isDueDatePast('2026-09-26', new Date('2026-09-27T00:00:00Z'))).toBe(true)
  })
})
