import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const provider = vi.hoisted(() => ({ sms: vi.fn(), email: vi.fn() }))
vi.mock('twilio', () => ({ default: () => ({ messages: { create: provider.sms } }) }))
vi.mock('resend', () => ({ Resend: class { emails = { send: provider.email } } }))

const phone = '+15551239876'
const recipient = 'private-customer@example.test'
const privateText = 'Private customer name and invoice balance'
const privateLink = 'https://example.test/portal/private-token-fixture'
const email = { to: recipient, subject: privateText, html: `<p>${privateText}</p><a href="${privateLink}">Invoice</a>`, idempotencyKey: 'private-job-identifier' }

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  vi.stubEnv('TWILIO_ACCOUNT_SID', 'AC_local_fixture')
  vi.stubEnv('TWILIO_AUTH_TOKEN', 'local-secret-fixture')
  vi.stubEnv('TWILIO_PHONE_NUMBER', '+15550000000')
  vi.stubEnv('RESEND_API_KEY', 'local-email-secret-fixture')
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  provider.sms.mockResolvedValue({ sid: 'SM_local_fixture' })
  provider.email.mockResolvedValue({ data: { id: 'email_fixture' }, error: null })
})
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks() })

function expectNoPrivateLogs() {
  const calls = [...vi.mocked(console.log).mock.calls, ...vi.mocked(console.error).mock.calls]
  // All log arguments must be fixed strings: even an Error's otherwise-hidden
  // stack or nested request body must never be handed to a logger.
  expect(calls.every(args => args.length === 1 && typeof args[0] === 'string')).toBe(true)
  const output = JSON.stringify(calls)
  for (const secret of [phone, recipient, privateText, privateLink, email.idempotencyKey, 'local-secret-fixture', 'local-email-secret-fixture']) {
    expect(output).not.toContain(secret)
  }
}

describe('delivery logs contain no customer payloads', () => {
  it('treats a success-shaped response without a provider receipt as uncertain', async () => {
    provider.sms.mockResolvedValue({})
    provider.email.mockResolvedValue({ data: {}, error: null })
    const { sendSms } = await import('@/lib/sms')
    const { sendEmail } = await import('@/lib/email')
    expect(await sendSms(phone, privateText)).toMatchObject({ success: false, retryable: false })
    expect(await sendEmail(email)).toMatchObject({ success: false, retryable: false })
    expectNoPrivateLogs()
  })
  it('omits the SMS recipient and body when delivery is unconfigured', async () => {
    vi.stubEnv('TWILIO_AUTH_TOKEN', '')
    const { sendSms } = await import('@/lib/sms')
    expect(await sendSms(phone, privateText)).toEqual({ success: false, error: 'SMS delivery not configured (Twilio env vars missing)', retryable: true })
    expect(provider.sms).not.toHaveBeenCalled()
    expect(console.log).toHaveBeenCalledWith('[sms-skipped] SMS delivery is not configured')
    expectNoPrivateLogs()
  })
  it.each([
    () => Object.assign(new Error(`${phone}: ${privateText} ${privateLink}`), { code: 21614, request: { to: phone, body: privateText } }),
    () => ({ status: 400, code: phone, message: privateText, moreInfo: privateLink, body: { recipient } }),
  ])('does not log an SMS provider error object or reflected request data', async makeError => {
    const error = makeError()
    provider.sms.mockRejectedValue(error)
    const { sendSms } = await import('@/lib/sms')
    expect(await sendSms(phone, privateText)).toEqual({ success: false, error: 'Failed to send SMS', retryable: 'status' in error && error.status === 400 })
    expect(console.error).toHaveBeenCalledWith('[sms-error] SMS provider request failed')
    expectNoPrivateLogs()
  })
  it('omits email recipients, subjects and HTML when delivery is unconfigured', async () => {
    vi.stubEnv('RESEND_API_KEY', '')
    const { sendEmail } = await import('@/lib/email')
    expect(await sendEmail(email)).toEqual({ success: false, error: 'Email delivery not configured (RESEND_API_KEY missing)', retryable: true })
    expect(provider.email).not.toHaveBeenCalled()
    expect(console.log).toHaveBeenCalledWith('[email-skipped] Email delivery is not configured')
    expectNoPrivateLogs()
  })
  it('redacts a returned email-provider rejection while preserving the existing result', async () => {
    const message = `Cannot send to ${recipient}: ${privateText} ${privateLink}`
    provider.email.mockResolvedValue({ data: null, error: { name: 'validation_error', message, request: email } })
    const { sendEmail } = await import('@/lib/email')
    expect(await sendEmail(email)).toEqual({ success: false, error: message, retryable: false })
    expect(console.error).toHaveBeenCalledWith('[email-error] Email provider rejected the request')
    expectNoPrivateLogs()
  })
  it('does not log thrown email-provider errors, stacks, or nested request data', async () => {
    provider.email.mockRejectedValue(Object.assign(new Error(`${recipient}: ${privateLink}`), { request: email }))
    const { sendEmail } = await import('@/lib/email')
    expect(await sendEmail(email)).toEqual({ success: false, error: 'Failed to send email', retryable: false })
    expect(console.error).toHaveBeenCalledWith('[email-error] Email provider request failed')
    expectNoPrivateLogs()
  })
  it('preserves successful delivery payloads, results and idempotency without logging them', async () => {
    const { sendSms } = await import('@/lib/sms')
    const { sendEmail } = await import('@/lib/email')
    expect(await sendSms(phone, privateText)).toEqual({ success: true, sid: 'SM_local_fixture' })
    expect(await sendEmail(email)).toEqual({ success: true, id: 'email_fixture' })
    expect(provider.sms).toHaveBeenCalledWith({ to: phone, from: '+15550000000', body: privateText })
    expect(provider.email).toHaveBeenCalledWith(expect.objectContaining({ to: recipient, subject: privateText, html: email.html }), { idempotencyKey: email.idempotencyKey })
    expect(console.log).not.toHaveBeenCalled()
    expect(console.error).not.toHaveBeenCalled()
  })
})
