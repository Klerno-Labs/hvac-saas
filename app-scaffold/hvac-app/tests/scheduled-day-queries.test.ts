import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/lib/db'
import { requireAuth, requireActiveSubscription } from '@/lib/session'
import FieldPage from '@/app/field/page'
import CalendarPage from '@/app/calendar/page'
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/db', () => ({ db: { job: { findMany: vi.fn() } } }))
vi.mock('@/lib/session', () => ({ requireAuth: vi.fn(), requireActiveSubscription: vi.fn() }))
vi.mock('@/app/field/job-card', () => ({ default: vi.fn() }))
const oldTimezone = process.env.TZ
beforeEach(() => {
  vi.resetAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-09-27T02:00:00Z'))
  process.env.TZ = 'America/Los_Angeles'
  const context = { userId: 'tech1', role: 'technician', organizationId: 'org1', organization: { timezone: 'America/Chicago' } }
  vi.mocked(requireAuth).mockResolvedValue(context as never)
  vi.mocked(requireActiveSubscription).mockResolvedValue(context as never)
  vi.mocked(db.job.findMany).mockRejectedValue(new Error('Captured query before rendering'))
})
afterEach(() => {
  vi.useRealTimers()
  if (oldTimezone === undefined) delete process.env.TZ; else process.env.TZ = oldTimezone
})
describe('scheduled date queries ignore host timezone', () => {
  it('loads Chicago September 26 work even after the UTC date has rolled over', async () => {
    await expect(FieldPage()).rejects.toThrow('Captured query')
    expect(db.job.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({
      organizationId: 'org1', assignedUserId: 'tech1', scheduledFor: { gte: new Date('2026-09-26T00:00:00Z'), lt: new Date('2026-09-27T00:00:00Z') },
    }) }))
  })
  it('uses UTC date boundaries for the selected calendar month', async () => {
    await expect(CalendarPage({ searchParams: Promise.resolve({ month: '2026-09' }) })).rejects.toThrow('Captured query')
    expect(db.job.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({
      organizationId: 'org1', assignedUserId: 'tech1', scheduledFor: { gte: new Date('2026-09-01T00:00:00Z'), lt: new Date('2026-10-01T00:00:00Z') },
    }) }))
  })
})
