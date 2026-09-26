import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ send: vi.fn() }))
vi.mock('resend', () => ({ Resend: class { emails = { send: mocks.send } } }))
import { sendInvoiceEmail, sendEstimateEmail, sendCollectionEmail, sendAppointmentReminderEmail, sendTeamInviteEmail } from '@/lib/email'
import { renderEmail } from '@/lib/email-template'

const value = 'Eve & Co <img src=x onerror="alert(1)">'
const escaped = 'Eve &amp; Co &lt;img src=x onerror=&quot;alert(1)&quot;&gt;'
const common = { to: 'test@example.test', customerName: value, orgName: value, totalFormatted: value, portalUrl: 'https://example.test/portal?token=a&view=invoice' }

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('RESEND_API_KEY', 'unit-test-key')
  mocks.send.mockResolvedValue({ data: { id: 'test-email' }, error: null })
})
afterEach(() => vi.unstubAllEnvs())

describe('email templates treat business data as text', () => {
  it.each([
    ['invoice', () => sendInvoiceEmail({ ...common, invoiceNumber: value, dueDate: value })],
    ['estimate', () => sendEstimateEmail({ ...common, estimateNumber: value })],
    ['collection', () => sendCollectionEmail({ ...common, invoiceNumber: value, dueDate: value, stage: 'overdue_1' })],
    ['appointment', () => sendAppointmentReminderEmail({ ...common, jobTitle: value, scheduledFor: new Date('2026-09-26T12:00:00Z') })],
    ['invitation', () => sendTeamInviteEmail({ to: common.to, orgName: value, inviterName: value, signupUrl: common.portalUrl })],
  ] as const)('escapes dynamic %s content exactly once', async (_name, send) => {
    expect(await send()).toEqual({ success: true, id: 'test-email' })
    const html = mocks.send.mock.calls[0][0].html as string
    expect(html).toContain(escaped)
    expect(html).not.toContain('<img')
    expect(html).not.toContain('&amp;amp;')
    expect(html).toContain('<p>')
  })

  it.each(['javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', '//untrusted.example/path', 'https://user:password@example.test'])('omits unsafe CTA URL %s', (url) => {
    expect(renderEmail({ title: 'Example', body: '<p>Safe template</p>', cta: { label: 'Continue', url } })).not.toContain('<a href=')
  })

  it('preserves a valid URL while escaping query separators and CTA text', () => {
    const html = renderEmail({ title: value, preheader: value, body: '<p>Safe template</p>', footer: value, cta: { label: value, url: common.portalUrl } })
    expect(html).toContain('href="https://example.test/portal?token=a&amp;view=invoice"')
    expect(html).not.toContain('<img')
    expect(html).not.toContain('&amp;amp;')
  })
})
