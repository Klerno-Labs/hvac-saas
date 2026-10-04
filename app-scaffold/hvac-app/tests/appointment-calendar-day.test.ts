import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/lib/db'
import { sendAppointmentReminderEmail } from '@/lib/email'
import { runAppointmentReminders } from '@/lib/appointment-reminders'
vi.mock('@/lib/db', () => ({ db: { job: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() }, $queryRaw: vi.fn(), $transaction: vi.fn() } }))
vi.mock('@/lib/email', () => ({ sendAppointmentReminderEmail: vi.fn() }))
vi.mock('@/lib/sms', () => ({ sendAppointmentReminderSms: vi.fn() }))
vi.mock('@/lib/events', () => ({ trackEvent: vi.fn() }))
beforeEach(() => {
  vi.resetAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-27T02:00:00Z'))
  vi.mocked(db.$transaction).mockImplementation(async (fn: any) => fn(db))
  vi.mocked(db.$queryRaw).mockResolvedValue([{ id: 'locked-job' }])
  vi.mocked(db.job.findUnique).mockImplementation((async ({where}: {where: {id: string}}) => (await db.job.findMany()).find(job => job.id === where.id)) as never)
})
afterEach(() => vi.useRealTimers())
const job = (id: string, date: string, timezone: string) => ({ id, title: 'Inspection', status: 'scheduled', scheduledFor: new Date(`${date}T00:00:00Z`),
  customer: { firstName: 'Customer', lastName: null, email: `${id}@example.test`, phone: null },
  organization: { id: 'org1', name: 'Fixture', timezone, subscriptionStatus: 'ACTIVE', trialEndsAt: null, smsEnabled: false },
})
describe('date-only appointment reminder selection', () => {
  it('selects tomorrow in each business timezone without inventing a visit time', async () => {
    vi.mocked(db.job.findMany).mockResolvedValue([
      job('chicago-tomorrow', '2026-09-27', 'America/Chicago'),
      job('chicago-later', '2026-09-28', 'America/Chicago'),
      job('utc-today', '2026-09-27', 'UTC'),
      job('utc-tomorrow', '2026-09-28', 'UTC'),
    ] as never)
    vi.mocked(sendAppointmentReminderEmail).mockResolvedValue({ success: true, id: 'message-fixture' })
    const result = await runAppointmentReminders()
    expect(result.sent).toBe(2)
    expect(vi.mocked(sendAppointmentReminderEmail).mock.calls.map(call => call[0].to)).toEqual(['chicago-tomorrow@example.test', 'utc-tomorrow@example.test'])
    expect(db.job.update).toHaveBeenCalledTimes(2)
  })
})
