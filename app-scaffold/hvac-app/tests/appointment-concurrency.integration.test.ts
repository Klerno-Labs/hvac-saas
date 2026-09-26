import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
vi.mock('@/lib/email', () => ({ sendAppointmentReminderEmail: vi.fn() }))
vi.mock('@/lib/sms', () => ({ sendAppointmentReminderSms: vi.fn() }))
if (!process.env.TEST_DATABASE_URL || !new URL(process.env.TEST_DATABASE_URL).pathname.endsWith('_test')) throw new Error('Dedicated TEST_DATABASE_URL required')
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL
const { db } = await import('@/lib/db')
const { sendAppointmentReminderEmail } = await import('@/lib/email')
const { runAppointmentReminders } = await import('@/lib/appointment-reminders')
let organizationId: string
let jobId: string
beforeAll(async () => {
  organizationId = (await db.organization.create({ data: { name: 'Reminder concurrency fixture', timezone: 'UTC', plan: 'PRO', subscriptionStatus: 'ACTIVE' } })).id
  const customer = await db.customer.create({ data: { organizationId, firstName: 'Alex', email: 'reminder-fixture@example.test' } })
  const tomorrow = new Date()
  tomorrow.setUTCHours(0, 0, 0, 0)
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)
  jobId = (await db.job.create({ data: { organizationId, customerId: customer.id, title: 'Service', status: 'scheduled', scheduledFor: tomorrow } })).id
  // Isolate this background worker test from fixtures belonging to other suites.
  const findMany = db.job.findMany.bind(db.job)
  vi.spyOn(db.job, 'findMany').mockImplementation((args: any) => findMany({ ...args, where: { ...args?.where, organizationId } }) as never)
})
afterAll(async () => {
  vi.restoreAllMocks()
  await db.organization.delete({ where: { id: organizationId } })
  await db.$disconnect()
})
describe('appointment worker concurrency', () => {
  it('skips a locked job while another worker is delivering it, then skips the committed reminder', async () => {
    let notifyStarted!: () => void
    let releaseDelivery!: () => void
    const started = new Promise<void>(resolve => { notifyStarted = resolve })
    const released = new Promise<void>(resolve => { releaseDelivery = resolve })
    vi.mocked(sendAppointmentReminderEmail).mockImplementation(async () => {
      notifyStarted()
      await released
      return { success: true, id: 'message1' }
    })
    const first = runAppointmentReminders()
    await started
    try {
      expect(await runAppointmentReminders()).toEqual({ sent: 0, errors: 0 })
      expect(sendAppointmentReminderEmail).toHaveBeenCalledTimes(1)
    } finally { releaseDelivery() }
    expect(await first).toEqual({ sent: 1, errors: 0 })
    expect(await runAppointmentReminders()).toEqual({ sent: 0, errors: 0 })
    expect(sendAppointmentReminderEmail).toHaveBeenCalledTimes(1)
    expect(vi.mocked(sendAppointmentReminderEmail).mock.calls[0][0].idempotencyKey).toMatch(new RegExp(`^appointment/${jobId}/\\d{4}-\\d{2}-\\d{2}/email$`))
    expect((await db.job.findUniqueOrThrow({ where: { id: jobId } })).appointmentReminderSentAt).not.toBeNull()
    expect(await db.activityEvent.count({ where: { entityId: jobId, eventName: 'appointment_reminder_sent' } })).toBe(1)
  })
})
