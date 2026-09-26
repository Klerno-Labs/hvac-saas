import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('@/lib/db', () => ({ db: { job: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() }, $queryRaw: vi.fn(), $transaction: vi.fn() } }))
vi.mock('@/lib/email', () => ({ sendAppointmentReminderEmail: vi.fn() }))
vi.mock('@/lib/sms', () => ({ sendAppointmentReminderSms: vi.fn() }))
vi.mock('@/lib/events', () => ({ trackEvent: vi.fn() }))
import { db } from '@/lib/db'
import { sendAppointmentReminderEmail } from '@/lib/email'
import { sendAppointmentReminderSms } from '@/lib/sms'
import { trackEvent } from '@/lib/events'
import { runAppointmentReminders } from '@/lib/appointment-reminders'
const job = () => ({ id: 'job1', title: 'Inspection', scheduledFor: new Date('2026-09-27T00:00:00Z'),
  customer: { firstName: 'Alex', lastName: null, email: 'customer@example.test', phone: '+15555550123' },
  organization: { id: 'org1', name: 'Fixture', timezone: 'America/Chicago', subscriptionStatus: 'ACTIVE', trialEndsAt: null, smsEnabled: true },
})
beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(db.$transaction).mockImplementation(async (fn: any) => fn(db))
  vi.mocked(db.$queryRaw).mockResolvedValue([{ id: 'job1' }])
  vi.mocked(db.job.findUnique).mockImplementation((async () => (await db.job.findMany())[0]) as never)
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-09-26T18:00:00Z'))
  vi.mocked(db.job.findMany).mockResolvedValue([job()] as never)
  vi.mocked(sendAppointmentReminderEmail).mockResolvedValue({ success: false, error: 'Unavailable' })
  vi.mocked(sendAppointmentReminderSms).mockResolvedValue({ success: false, error: 'Unavailable' })
})
afterEach(() => vi.useRealTimers())
describe('appointment reminder delivery truth', () => {
  it('does not mark failed email or SMS as sent, leaving it retryable', async () => {
    expect(await runAppointmentReminders()).toEqual({ sent: 0, errors: 2 })
    expect(db.job.update).not.toHaveBeenCalled()
    expect(trackEvent).not.toHaveBeenCalled()
  })
  it('counts the reminder as sent if one channel accepted it and reports the other failure', async () => {
    vi.mocked(sendAppointmentReminderEmail).mockResolvedValue({ success: true, id: 'message1' })
    expect(await runAppointmentReminders()).toEqual({ sent: 1, errors: 1 })
    expect(db.job.update).toHaveBeenCalledTimes(1)
    expect(trackEvent).toHaveBeenCalledTimes(1)
  })
  it('can retry a rejected delivery successfully on a later run', async () => {
    await runAppointmentReminders()
    vi.mocked(sendAppointmentReminderEmail).mockResolvedValue({ success: true, id: 'message1' })
    vi.mocked(sendAppointmentReminderSms).mockResolvedValue({ success: true, sid: 'sms1' })
    expect(await runAppointmentReminders()).toEqual({ sent: 1, errors: 0 })
    expect(db.job.update).toHaveBeenCalledTimes(1)
  })
  it('does not permanently mark a customer without contact details as reminded', async () => {
    const fixture = job()
    vi.mocked(db.job.findMany).mockResolvedValue([{ ...fixture, customer: { ...fixture.customer, email: null, phone: null } }] as never)
    expect(await runAppointmentReminders()).toEqual({ sent: 0, errors: 0 })
    expect(db.job.update).not.toHaveBeenCalled()
  })
})
