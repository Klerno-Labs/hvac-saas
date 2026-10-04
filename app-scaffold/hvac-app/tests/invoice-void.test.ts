import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('@/lib/mutation-access', () => ({ requireMutationAccess: vi.fn(async () => ({ authorized: true, context: { organizationId: 'org1', userId: 'owner1', session: { user: {} } } })) }))
vi.mock('@/lib/db', () => ({ db: { $transaction: vi.fn(), $queryRaw: vi.fn(), invoice: { findFirst: vi.fn(), updateMany: vi.fn() }, payment: { findFirst: vi.fn() }, organization: { findUnique: vi.fn() } } }))
vi.mock('@/lib/invoice-payment-attempt', () => ({ claimInvoicePaymentAttemptForCancellation: vi.fn(), hasActiveInvoicePaymentAttempt: vi.fn(), releaseInvoicePaymentLease: vi.fn(), retireInvoicePaymentAttempt: vi.fn() }))
vi.mock('@/lib/events', () => ({ trackEvent: vi.fn() }))
vi.mock('@/lib/audit', () => ({ logAudit: vi.fn() }))
vi.mock('@/lib/portal', () => ({ getOrCreatePortalUrl: vi.fn() }))
vi.mock('@/lib/email', () => ({ sendInvoiceEmail: vi.fn() }))
vi.mock('@/lib/stripe', () => ({ getStripe: vi.fn() }))
import { db } from '@/lib/db'
import { getStripe } from '@/lib/stripe'
import { logAudit } from '@/lib/audit'
import { claimInvoicePaymentAttemptForCancellation, hasActiveInvoicePaymentAttempt, releaseInvoicePaymentLease, retireInvoicePaymentAttempt, type InvoicePaymentAttempt } from '@/lib/invoice-payment-attempt'
import { updateInvoiceStatus } from '@/app/invoices/[invoiceId]/actions'
const form = () => { const data = new FormData(); data.set('status', 'void'); return data }
const original = { id: 'invoice1', organizationId: 'org1', status: 'sent', totalCents: 12000, outstandingCents: 12000, customer: {}, invoiceNumber: 'INV-1', stripeCheckoutSessionId: null as string | null, updatedAt: new Date('2026-09-01') }
let current = { ...original }
const attempt: InvoicePaymentAttempt = { id: 'attempt1', organizationId: 'org1', invoiceId: 'invoice1', method: 'checkout', connectedAccountId: 'acct_original', amountCents: 12000, params: {}, providerId: 'cs1', leaseToken: 'lease1', createdAt: new Date() }
const checkout = { id: 'cs1', mode: 'payment', currency: 'usd', amount_total: 12000, metadata: { invoiceId: 'invoice1', organizationId: 'org1' }, status: 'open', payment_status: 'unpaid', payment_intent: 'pi1' }
const retrieve = vi.fn(), expire = vi.fn()
function knownCheckout() {
  current.stripeCheckoutSessionId = 'cs1'
  vi.mocked(claimInvoicePaymentAttemptForCancellation).mockResolvedValue({ success: true, attempt })
}
beforeEach(() => {
  vi.resetAllMocks()
  current = { ...original }
  vi.mocked(db.$transaction).mockImplementation(async (run: unknown) => (run as (tx: typeof db) => Promise<unknown>)(db) as never)
  vi.mocked(db.invoice.findFirst).mockImplementation((() => Promise.resolve({ ...current })) as never)
  vi.mocked(db.invoice.updateMany).mockResolvedValue({ count: 1 })
  vi.mocked(db.payment.findFirst).mockResolvedValue(null)
  vi.mocked(db.organization.findUnique).mockResolvedValue({ stripeConnectedAccountId: 'acct_current' } as never)
  vi.mocked(claimInvoicePaymentAttemptForCancellation).mockResolvedValue({ success: true, attempt: null })
  vi.mocked(hasActiveInvoicePaymentAttempt).mockResolvedValue(false)
  vi.mocked(releaseInvoicePaymentLease).mockResolvedValue(true)
  vi.mocked(retireInvoicePaymentAttempt).mockImplementation(async () => { current.stripeCheckoutSessionId = null; current.updatedAt = new Date('2026-09-02'); return true })
  retrieve.mockResolvedValue({ ...checkout })
  expire.mockResolvedValue({ ...checkout, status: 'expired' })
  vi.mocked(getStripe).mockReturnValue({ checkout: { sessions: { retrieve, expire } } } as never)
})
describe('invoice cancellation shares the payment reservation lock', () => {
  it('voids an unpaid invoice and records its audit inside the same transaction', async () => {
    expect(await updateInvoiceStatus('invoice1', form())).toEqual({ success: true })
    expect(db.$queryRaw).toHaveBeenCalledTimes(2)
    expect(db.$queryRaw).toHaveBeenLastCalledWith(expect.anything(), 'invoice1', 'org1')
    expect(hasActiveInvoicePaymentAttempt).toHaveBeenLastCalledWith(db, 'invoice1', 'org1')
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'invoice_void', organizationId: 'org1' }), db)
    expect(db.invoice.updateMany).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ data: { status: 'void', outstandingCents: 0, stripeCheckoutSessionId: null } }))
  })
  it('voids a draft without attempting a Checkout claim', async () => {
    current.status = 'draft'
    expect(await updateInvoiceStatus('invoice1', form())).toEqual({ success: true })
    expect(claimInvoicePaymentAttemptForCancellation).not.toHaveBeenCalled()
    expect(retrieve).not.toHaveBeenCalled()
  })
  it('blocks a Terminal, in-flight, or unknown provider attempt before any provider mutation', async () => {
    vi.mocked(claimInvoicePaymentAttemptForCancellation).mockResolvedValue({ success: false, error: 'Payment outcome is pending' })
    expect(await updateInvoiceStatus('invoice1', form())).toEqual({ success: false, error: 'Payment outcome is pending' })
    expect(expire).not.toHaveBeenCalled()
    expect(db.invoice.updateMany).not.toHaveBeenCalled()
  })
  it('blocks a legacy pending payment even with no activity reservation', async () => {
    vi.mocked(db.payment.findFirst).mockResolvedValue({ id: 'pending-terminal' } as never)
    expect(await updateInvoiceStatus('invoice1', form())).toMatchObject({ success: false, error: expect.stringContaining('outcome is still pending') })
    expect(db.invoice.updateMany).not.toHaveBeenCalled()
  })
  it.each(['open', 'expired'])('retires a provider-confirmed %s Checkout under its original account before voiding', async status => {
    knownCheckout()
    retrieve.mockResolvedValue({ ...checkout, status })
    expect(await updateInvoiceStatus('invoice1', form())).toEqual({ success: true })
    expect(retrieve).toHaveBeenCalledExactlyOnceWith('cs1', { stripeAccount: 'acct_original', timeout: 10000, maxNetworkRetries: 0 })
    expect(expire).toHaveBeenCalledTimes(status === 'open' ? 1 : 0)
    expect(retireInvoicePaymentAttempt).toHaveBeenCalledExactlyOnceWith(attempt, { paymentIntentId: 'pi1' })
    expect(db.invoice.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ updatedAt: new Date('2026-09-02') }) }))
  })
  it('preserves legacy saved Checkout expiration before voiding', async () => {
    current.stripeCheckoutSessionId = 'cs1'
    expect(await updateInvoiceStatus('invoice1', form())).toEqual({ success: true })
    expect(expire).toHaveBeenCalledExactlyOnceWith('cs1', expect.objectContaining({ stripeAccount: 'acct_current' }))
    expect(retireInvoicePaymentAttempt).not.toHaveBeenCalled()
  })
  it.each([
    { status: 'complete' }, { payment_status: 'paid' }, { metadata: { invoiceId: 'other', organizationId: 'org1' } },
    { metadata: { invoiceId: 'invoice1', organizationId: 'other' } }, { amount_total: 999 }, { id: 'cs_other' }, { currency: 'eur' }, { mode: 'subscription' },
  ])('does not expire or void an unmatched or completed Checkout: %j', async change => {
    knownCheckout(); retrieve.mockResolvedValue({ ...checkout, ...change })
    expect((await updateInvoiceStatus('invoice1', form())).success).toBe(false)
    expect(expire).not.toHaveBeenCalled()
    expect(retireInvoicePaymentAttempt).not.toHaveBeenCalled()
    expect(db.invoice.updateMany).not.toHaveBeenCalled()
    expect(releaseInvoicePaymentLease).toHaveBeenCalledWith(attempt)
  })
  it.each(['response_lost', 'still_open', 'retirement_lost'])('never voids when closure is uncertain: %s', async failure => {
    knownCheckout()
    if (failure === 'response_lost') expire.mockRejectedValue(new Error('Connection lost'))
    if (failure === 'still_open') expire.mockResolvedValue(checkout)
    if (failure === 'retirement_lost') vi.mocked(retireInvoicePaymentAttempt).mockResolvedValue(false)
    expect((await updateInvoiceStatus('invoice1', form())).success).toBe(false)
    expect(db.invoice.updateMany).not.toHaveBeenCalled()
    expect(releaseInvoicePaymentLease).toHaveBeenCalledWith(attempt)
  })
  it('rechecks a newly reserved payment after provider expiration', async () => {
    knownCheckout()
    vi.mocked(hasActiveInvoicePaymentAttempt).mockResolvedValue(true)
    expect((await updateInvoiceStatus('invoice1', form())).success).toBe(false)
    expect(retireInvoicePaymentAttempt).toHaveBeenCalled()
    expect(db.invoice.updateMany).not.toHaveBeenCalled()
  })
  it('rejects concurrent payment confirmation during cancellation', async () => {
    knownCheckout()
    vi.mocked(retireInvoicePaymentAttempt).mockImplementation(async () => { current.status = 'paid'; current.outstandingCents = 0; current.stripeCheckoutSessionId = null; return true })
    expect((await updateInvoiceStatus('invoice1', form())).success).toBe(false)
    expect(db.invoice.updateMany).not.toHaveBeenCalled()
  })
  it('rejects an invoice version change after preflight, before final lock', async () => {
    vi.mocked(db.$transaction).mockImplementationOnce(async (run: unknown) => {
      const result = await (run as (tx: typeof db) => Promise<unknown>)(db)
      current.updatedAt = new Date('2026-09-03')
      return result as never
    })
    expect((await updateInvoiceStatus('invoice1', form())).success).toBe(false)
    expect(db.invoice.updateMany).not.toHaveBeenCalled()
  })
})
