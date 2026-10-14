import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('@/lib/mutation-access', () => ({ requireMutationAccess: vi.fn(async () => ({ authorized: true, context: { organizationId: 'org1', userId: 'user1', session: { user: {} } } })) }))
vi.mock('@/lib/db', () => ({ db: { estimate: { findFirst: vi.fn(), updateMany: vi.fn() }, invoice: { findFirst: vi.fn(), updateMany: vi.fn() }, organization: { findUniqueOrThrow: vi.fn() } } }))
vi.mock('@/lib/events', () => ({ trackEvent: vi.fn() }))
vi.mock('@/lib/audit', () => ({ logAudit: vi.fn() }))
vi.mock('@/lib/portal', () => ({ getOrCreatePortalUrl: vi.fn(async () => 'https://example.test/portal/customer') }))
vi.mock('@/lib/email', () => ({ sendEstimateEmail: vi.fn(), sendInvoiceEmail: vi.fn() }))
vi.mock('@/lib/stripe', () => ({ getStripe: vi.fn() }))
import { db } from '@/lib/db'
import { sendEstimateEmail, sendInvoiceEmail } from '@/lib/email'
import { trackEvent } from '@/lib/events'
import { getOrCreatePortalUrl } from '@/lib/portal'
import { updateEstimateStatus } from '@/app/estimates/[estimateId]/actions'
import { updateInvoiceStatus } from '@/app/invoices/[invoiceId]/actions'
const form = () => { const data = new FormData(); data.set('status', 'sent'); return data }
const customer = { id: 'customer1', firstName: 'Alex', email: 'customer@example.test' }
beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  const document = { id: 'document1', status: 'draft', updatedAt: new Date(), totalCents: 10000, outstandingCents: 10000, customer, job: { customer }, notes: 'Private supplier margin discussion' }
  vi.mocked(db.estimate.findFirst).mockResolvedValue(document as never)
  vi.mocked(db.invoice.findFirst).mockResolvedValue(document as never)
  vi.mocked(db.estimate.updateMany).mockResolvedValue({ count: 1 })
  vi.mocked(db.invoice.updateMany).mockResolvedValue({ count: 1 })
  vi.mocked(db.organization.findUniqueOrThrow).mockResolvedValue({ name: 'Test Shop' } as never)
  vi.mocked(sendEstimateEmail).mockResolvedValue({ success: true, id: 'message1' })
  vi.mocked(sendInvoiceEmail).mockResolvedValue({ success: true, id: 'message1' })
  vi.mocked(trackEvent).mockResolvedValue({} as never)
  vi.mocked(getOrCreatePortalUrl).mockResolvedValue('https://example.test/portal/customer')
})

it('passes the current balance to invoice email wording independently of the original total', async () => {
  vi.mocked(db.invoice.findFirst).mockResolvedValue({ id: 'document1', status: 'sent', updatedAt: new Date(), totalCents: 10000, outstandingCents: 0, customer } as never)
  expect(await updateInvoiceStatus('document1', form())).toEqual({ success: true })
  expect(sendInvoiceEmail).toHaveBeenCalledWith(expect.objectContaining({ totalFormatted: '$100.00', outstandingCents: 0 }))
})
afterEach(() => { vi.restoreAllMocks() })
describe.each([
  ['estimate', updateEstimateStatus, sendEstimateEmail, db.estimate.findFirst],
  ['invoice', updateInvoiceStatus, sendInvoiceEmail, db.invoice.findFirst],
] as const)('%s email delivery outcome', (kind, update, send, find) => {
  it('reports confirmed provider submission without passing internal notes to the email template', async () => {
    expect(await update('document1', form())).toEqual({ success: true })
    expect(vi.mocked(send).mock.calls[0][0]).not.toHaveProperty('notes')
    expect(JSON.stringify(vi.mocked(send).mock.calls[0][0])).not.toContain('Private supplier margin discussion')
  })
  it('reports saved status with a clear warning when delivery fails', async () => {
    vi.mocked(send).mockResolvedValue({ success: false, error: 'Provider unavailable', retryable: true })
    expect(await update('document1', form())).toMatchObject({ success: true, warning: expect.stringContaining('could not be delivered') })
  })
  it('warns when the customer has no email', async () => {
    vi.mocked(find).mockResolvedValue({ status: 'draft', totalCents: 10000, customer: {}, job: { customer: {} } } as never)
    expect(await update('document1', form())).toMatchObject({ success: true, warning: expect.stringContaining('no email address') })
    expect(send).not.toHaveBeenCalled()
  })
  it('allows an explicit retry from the sent state', async () => {
    vi.mocked(find).mockResolvedValue({ status: 'sent', totalCents: 10000, customer, job: { customer } } as never)
    expect(await update('document1', form())).toEqual({ success: true })
    expect(send).toHaveBeenCalledTimes(1)
  })
  it('preserves successful submission when subsequent activity logging fails', async () => {
    vi.mocked(trackEvent).mockRejectedValue(new Error('Database request contained private customer metadata'))

    expect(await update('document1', form())).toEqual({ success: true })
    expect(send).toHaveBeenCalledTimes(1)
    expect(console.error).toHaveBeenCalledExactlyOnceWith(`${kind === 'estimate' ? 'Estimate' : 'Invoice'} status activity could not be recorded`)
  })
  it('preserves the delivery warning when subsequent activity logging fails', async () => {
    vi.mocked(send).mockResolvedValue({ success: false, error: 'Provider unavailable', retryable: true })
    vi.mocked(trackEvent).mockRejectedValue(new Error('Activity storage unavailable'))

    expect(await update('document1', form())).toMatchObject({ success: true, warning: expect.stringContaining('could not be delivered') })
    expect(send).toHaveBeenCalledTimes(1)
  })
  it.each(['portal', 'provider'] as const)('does not log private request details from a thrown %s error', async (source) => {
    const sensitiveError = new Error('customer@example.test https://example.test/portal/private-bearer-token')
    if (source === 'portal') vi.mocked(getOrCreatePortalUrl).mockRejectedValue(sensitiveError)
    else vi.mocked(send).mockRejectedValue(sensitiveError)

    expect(await update('document1', form())).toMatchObject({ success: true, warning: expect.stringContaining(source === 'portal' ? 'could not be delivered' : 'before retrying to avoid sending it twice') })
    expect(console.error).toHaveBeenCalledExactlyOnceWith(`${kind === 'estimate' ? 'Estimate' : 'Invoice'} delivery failed after status update`)
    if (source === 'portal') expect(send).not.toHaveBeenCalled()
  })
  it.each([false, undefined])('does not recommend blind resending when acceptance is uncertain (retryable=%s)', async (retryable) => {
    vi.mocked(send).mockResolvedValue({ success: false, error: 'Provider acceptance unknown', retryable })

    const result = await update('document1', form())
    expect(result).toMatchObject({ success: true, warning: expect.stringContaining('before retrying to avoid sending it twice') })
    expect(result).toMatchObject({ warning: expect.not.stringContaining('choose Sent again') })
    expect(send).toHaveBeenCalledTimes(1)
  })
})
