import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const transport = vi.hoisted(() => ({ email: vi.fn(), sms: vi.fn() }))
vi.mock('resend', () => ({ Resend: class { emails = { send: transport.email } } }))
vi.mock('twilio', () => ({ default: vi.fn(() => ({ messages: { create: transport.sms } })) }))
import { sendAppointmentReminderEmail } from '@/lib/email'
import { sendAppointmentReminderSms } from '@/lib/sms'
const previousTimezone = process.env.TZ
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('RESEND_API_KEY', 'fixture-only')
  vi.stubEnv('TWILIO_ACCOUNT_SID', 'fixture-only')
  vi.stubEnv('TWILIO_AUTH_TOKEN', 'fixture-only')
  vi.stubEnv('TWILIO_PHONE_NUMBER', '+15555550100')
  process.env.TZ = 'America/Chicago'
  transport.email.mockResolvedValue({ data: { id: 'fixture-email' }, error: null })
  transport.sms.mockResolvedValue({ sid: 'fixture-sms' })
})
afterEach(() => {
  vi.unstubAllEnvs()
  if (previousTimezone === undefined) delete process.env.TZ; else process.env.TZ = previousTimezone
})
const common = { customerName: 'Sample', orgName: 'Fixture company', jobTitle: 'Inspection', scheduledFor: new Date('2026-09-26T00:00:00Z') }
describe('appointment messages preserve the selected calendar date', () => {
  it('does not invent a time or shift a date in email', async () => {
    await sendAppointmentReminderEmail({ ...common, to: 'fixture@example.test' })
    const html = transport.email.mock.calls[0][0].html
    expect(html).toContain('Sep 26, 2026')
    expect(html).toContain('Arrival time to be confirmed')
    expect(html).not.toContain('Sep 25')
    expect(html).not.toMatch(/\b(?:AM|PM)\b/)
  })
  it('does not invent a time or shift a date in SMS', async () => {
    await sendAppointmentReminderSms({ ...common, to: '+15555550101' })
    const body = transport.sms.mock.calls[0][0].body
    expect(body).toContain('Sep 26, 2026')
    expect(body).toContain('confirm your arrival window')
    expect(body).not.toContain('Sep 25')
    expect(body).not.toMatch(/\b(?:AM|PM)\b/)
  })
})
