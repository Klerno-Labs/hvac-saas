import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  access: vi.fn(), org: vi.fn(), payment: vi.fn(), job: vi.fn(), invoice: vi.fn(), update: vi.fn(), transaction: vi.fn(),
  stripe: vi.fn(), create: vi.fn(), retrieve: vi.fn(), capture: vi.fn(), cancel: vi.fn(), token: vi.fn(), event: vi.fn(), audit: vi.fn(),
  reserve: vi.fn(), claim: vi.fn(), save: vi.fn(), release: vi.fn(), retire: vi.fn(), raw: vi.fn(),
}))
vi.mock('@/lib/mutation-access', () => ({ requireMutationAccess: mocks.access, jobAccessWhere: () => ({ organizationId: 'org_one', assignedUserId: 'tech_one' }) }))
vi.mock('@/lib/db', () => ({ db: {
  organization: { findUnique: mocks.org }, payment: { findUnique: mocks.payment }, job: { findFirst: mocks.job },
  invoice: { findFirst: mocks.invoice, update: mocks.update }, $transaction: mocks.transaction,
} }))
vi.mock('@/lib/stripe', () => ({ getStripe: mocks.stripe }))
vi.mock('@/lib/events', () => ({ trackEvent: mocks.event }))
vi.mock('@/lib/audit', () => ({ logAudit: mocks.audit }))
vi.mock('@/lib/invoice-payment-attempt', () => ({ reserveInvoicePaymentAttempt: mocks.reserve, saveInvoicePaymentProviderId: mocks.save, releaseInvoicePaymentLease: mocks.release, retireInvoicePaymentAttempt: mocks.retire, claimInvoicePaymentAttemptForCancellation: mocks.claim }))
import { createTerminalPaymentIntent, captureTerminalPayment, cancelTerminalPaymentAttempt, createTerminalConnectionToken } from '@/app/jobs/[jobId]/terminal-payment-actions'

const organization = { id: 'org_one', stripeConnectedAccountId: 'acct_one', stripeChargesEnabled: true, stripeTerminalEnabled: true, platformFeePercent: 2.9 }
const invoice = { id: 'inv_one', invoiceNumber: 'INV-001', organizationId: 'org_one', jobId: 'job_one', status: 'sent', totalCents: 5000, outstandingCents: 5000, organization }
const payment = { id: 'pay_one', invoiceId: 'inv_one', organizationId: 'org_one', method: 'terminal', status: 'pending', amountCents: 5000, stripePaymentIntent: 'pi_one', invoice }
const params = { amount: 5000, currency: 'usd', capture_method: 'manual', payment_method_types: ['card_present'], metadata: { invoiceId: 'inv_one', organizationId: 'org_one', method: 'terminal' } }
const attempt = { id: 'attempt_one', invoiceId: 'inv_one', organizationId: 'org_one', connectedAccountId: 'acct_one', amountCents: 5000, params, providerId: null, leaseToken: 'lease_one' }
const intent = { id: 'pi_one', client_secret: 'pi_one_secret_fixture', ...params, amount_capturable: 5000, amount_received: 0, status: 'requires_payment_method' }

beforeEach(() => {
  vi.resetAllMocks()
  mocks.access.mockResolvedValue({ authorized: true, context: { userId: 'tech_one', organizationId: 'org_one', role: 'technician' } })
  mocks.org.mockResolvedValue(organization); mocks.payment.mockResolvedValue(payment); mocks.job.mockResolvedValue({ id: 'job_one' }); mocks.invoice.mockResolvedValue(invoice)
  mocks.reserve.mockResolvedValue({ success: true, attempt, invoice }); mocks.claim.mockResolvedValue({ success: true, attempt: { ...attempt, providerId: 'pi_one' } }); mocks.cancel.mockResolvedValue({ ...intent, status: 'canceled' }); mocks.save.mockResolvedValue(true); mocks.release.mockResolvedValue(true); mocks.retire.mockResolvedValue(true)
  mocks.create.mockResolvedValue(intent); mocks.retrieve.mockResolvedValue({ ...intent, status: 'requires_capture' }); mocks.capture.mockResolvedValue({ ...intent, status: 'succeeded', amount_received: 5000, amount_capturable: 0 })
  mocks.stripe.mockReturnValue({ paymentIntents: { create: mocks.create, retrieve: mocks.retrieve, capture: mocks.capture, cancel: mocks.cancel }, terminal: { connectionTokens: { create: mocks.token } } })
  mocks.event.mockResolvedValue({}); mocks.audit.mockResolvedValue({}); mocks.update.mockResolvedValue(invoice)
  mocks.transaction.mockImplementation(fn => fn({ $queryRaw: mocks.raw, invoice: { findFirst: mocks.invoice, update: mocks.update }, payment: { findUnique: mocks.payment } }))
})
afterEach(() => vi.restoreAllMocks())

describe('Terminal intent ownership and retry safety', () => {
  it('reserves assigned work and uses the durable key, saving provider identity before returning its reader secret', async () => {
    expect(await createTerminalPaymentIntent('inv_one')).toEqual({ success: true, paymentIntentId: 'pi_one', clientSecret: 'pi_one_secret_fixture', amountCents: 5000 })
    expect(mocks.reserve).toHaveBeenCalledWith(expect.objectContaining({ invoiceId: 'inv_one', organizationId: 'org_one', method: 'terminal', invoiceWhere: { job: { organizationId: 'org_one', assignedUserId: 'tech_one' }, customer: { deletedAt: null } } }))
    expect(mocks.create).toHaveBeenCalledWith(params, { stripeAccount: 'acct_one', timeout: 10000, maxNetworkRetries: 0, idempotencyKey: 'invoice-payment:attempt_one' })
    expect(mocks.save).toHaveBeenCalledWith(attempt, 'pi_one')
    expect(mocks.release).toHaveBeenCalledWith(attempt)
  })
  it('does not contact Stripe when another payment channel owns the reservation', async () => {
    mocks.reserve.mockResolvedValue({ success: false, error: 'A payment is already in progress' })
    expect(await createTerminalPaymentIntent('inv_one')).toEqual({ success: false, error: 'A payment is already in progress' })
    expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.retrieve).not.toHaveBeenCalled()
  })
  it('reuses a saved intent instead of creating a second one', async () => {
    mocks.reserve.mockResolvedValue({ success: true, attempt: { ...attempt, providerId: 'pi_one' }, invoice })
    mocks.retrieve.mockResolvedValue(intent)
    expect((await createTerminalPaymentIntent('inv_one')).success).toBe(true)
    expect(mocks.create).not.toHaveBeenCalled()
    expect(mocks.retrieve).toHaveBeenCalledWith('pi_one', {}, expect.objectContaining({ stripeAccount: 'acct_one' }))
  })
  it.each(['processing', 'succeeded'])('never offers a new reader secret for an already %s intent', async status => {
    mocks.create.mockResolvedValue({ ...intent, status, amount_received: status === 'succeeded' ? 5000 : 0 })
    expect((await createTerminalPaymentIntent('inv_one')).success).toBe(false)
    expect(mocks.save).toHaveBeenCalled(); expect(mocks.retire).not.toHaveBeenCalled()
  })
  it('offers capture recovery only for the same saved and validated authorization without collecting a new card', async () => {
    mocks.reserve.mockResolvedValue({ success: true, attempt: { ...attempt, providerId: 'pi_one' }, invoice })
    mocks.retrieve.mockResolvedValue({ ...intent, status: 'requires_capture' })
    expect(await createTerminalPaymentIntent('inv_one')).toEqual({ success: true, paymentIntentId: 'pi_one', amountCents: 5000, readyForCapture: true })
    expect(mocks.create).not.toHaveBeenCalled()
    expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ providerId: 'pi_one' }), 'pi_one')
  })
  it('retires only a provider-confirmed canceled attempt', async () => {
    mocks.create.mockResolvedValue({ ...intent, status: 'canceled' })
    expect((await createTerminalPaymentIntent('inv_one')).success).toBe(false)
    expect(mocks.retire).toHaveBeenCalledWith(attempt); expect(mocks.save).not.toHaveBeenCalled()
  })
  it('does not return the secret when durable identity could not be saved', async () => {
    mocks.save.mockResolvedValue(false)
    expect(await createTerminalPaymentIntent('inv_one')).toMatchObject({ success: false })
    expect(mocks.event).not.toHaveBeenCalled()
  })
  it('keeps unknown provider outcomes retryable through the same reservation without leaking details', async () => {
    mocks.create.mockRejectedValue(new Error('SECRET provider response'))
    expect(await createTerminalPaymentIntent('inv_one')).toMatchObject({ success: false, error: expect.not.stringContaining('SECRET') })
    expect(mocks.retire).not.toHaveBeenCalled(); expect(mocks.release).toHaveBeenCalledWith(attempt)
  })
  it.each([{ amount: 6000 }, { currency: 'eur' }, { capture_method: 'automatic' }, { metadata: { ...params.metadata, invoiceId: 'inv_other' } }])('rejects a provider mismatch before sharing a client secret: %o', mismatch => {
    mocks.create.mockResolvedValue({ ...intent, ...mismatch })
    return expect(createTerminalPaymentIntent('inv_one')).resolves.toMatchObject({ success: false })
  })
  it('keeps a successfully saved intent usable when optional telemetry fails', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.event.mockRejectedValue(new Error('PRIVATE telemetry detail'))
    expect((await createTerminalPaymentIntent('inv_one')).success).toBe(true)
    expect(JSON.stringify(log.mock.calls)).not.toContain('PRIVATE')
  })
})

describe('Terminal capture preserves webhook-only settlement', () => {
  it('checks tenant assignment, locks the invoice, captures with a stable key and leaves financial state for the webhook', async () => {
    expect(await captureTerminalPayment('pi_one')).toEqual({ success: true, paymentIntentId: 'pi_one', invoiceId: 'inv_one' })
    expect(mocks.job).toHaveBeenCalledWith({ where: { id: 'job_one', organizationId: 'org_one', assignedUserId: 'tech_one' } })
    expect(mocks.capture).toHaveBeenCalledWith('pi_one', {}, { stripeAccount: 'acct_one', timeout: 10000, maxNetworkRetries: 0, idempotencyKey: 'terminal-capture:pi_one' })
    expect(mocks.update).toHaveBeenCalledWith({ where: { id: 'inv_one' }, data: { updatedAt: expect.any(Date) } })
    expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), { maxWait: 5000, timeout: 20000 })
  })
  it.each(['void', 'paid', 'draft'])('does not capture after a concurrent invoice transition to %s', async status => {
    mocks.invoice.mockResolvedValue({ ...invoice, status })
    expect((await captureTerminalPayment('pi_one')).success).toBe(false)
    expect(mocks.capture).not.toHaveBeenCalled()
  })
  it('never falls back to the original invoice amount after its balance reaches zero', async () => {
    mocks.invoice.mockResolvedValue({ ...invoice, outstandingCents: 0 })
    expect((await captureTerminalPayment('pi_one')).success).toBe(false)
    expect(mocks.capture).not.toHaveBeenCalled()
  })
  it('refuses capturing a Checkout payment through the Terminal action', async () => {
    mocks.payment.mockResolvedValue({ ...payment, method: 'checkout' })
    expect((await captureTerminalPayment('pi_one')).success).toBe(false)
    expect(mocks.retrieve).not.toHaveBeenCalled()
  })
  it('refuses another tenant or an unassigned job', async () => {
    mocks.payment.mockResolvedValueOnce({ ...payment, organizationId: 'org_other' })
    expect((await captureTerminalPayment('pi_one')).success).toBe(false)
    mocks.job.mockResolvedValue(null)
    expect((await captureTerminalPayment('pi_one')).success).toBe(false)
    expect(mocks.retrieve).not.toHaveBeenCalled()
  })
  it.each([{ id: 'pi_other' }, { amount: 5001 }, { amount_capturable: 4999 }, { metadata: { ...params.metadata, organizationId: 'org_other' } }])('does not capture mismatched authorizations %o', async mismatch => {
    mocks.retrieve.mockResolvedValue({ ...intent, status: 'requires_capture', ...mismatch })
    expect((await captureTerminalPayment('pi_one')).success).toBe(false)
    expect(mocks.capture).not.toHaveBeenCalled()
  })
  it('recovers a provider-succeeded capture after a lost response without capturing again', async () => {
    mocks.retrieve.mockResolvedValue({ ...intent, status: 'succeeded', amount_received: 5000 })
    expect((await captureTerminalPayment('pi_one')).success).toBe(true)
    expect(mocks.capture).not.toHaveBeenCalled(); expect(mocks.update).not.toHaveBeenCalled()
  })
  it('reports uncertain capture without raw provider details or local paid claims', async () => {
    mocks.capture.mockRejectedValue(new Error('SECRET raw provider error'))
    expect(await captureTerminalPayment('pi_one')).toMatchObject({ success: false, error: expect.not.stringContaining('SECRET') })
    expect(mocks.update).not.toHaveBeenCalled(); expect(mocks.event).not.toHaveBeenCalled()
  })
  it('does not obscure successful capture when optional activity/audit writes fail', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.event.mockRejectedValue(new Error('PRIVATE activity')); mocks.audit.mockRejectedValue(new Error('PRIVATE audit'))
    expect((await captureTerminalPayment('pi_one')).success).toBe(true)
    expect(mocks.audit).toHaveBeenCalled(); expect(JSON.stringify(log.mock.calls)).not.toContain('PRIVATE')
  })
  it.each([createTerminalPaymentIntent, captureTerminalPayment])('blocks unauthorized callers before provider or reservation access', async action => {
    mocks.access.mockResolvedValue({ authorized: false, error: 'Not authorized' })
    expect(await action('id')).toEqual({ success: false, error: 'Not authorized' })
    expect(mocks.stripe).not.toHaveBeenCalled(); expect(mocks.reserve).not.toHaveBeenCalled()
  })
  it('sanitizes connection token errors and bounds the provider request', async () => {
    mocks.token.mockRejectedValue(new Error('SECRET key'))
    expect(await createTerminalConnectionToken()).toEqual({ success: false, error: 'The card reader connection could not be prepared. Please try again.' })
    expect(mocks.token).toHaveBeenCalledWith({}, { stripeAccount: 'acct_one', timeout: 10000, maxNetworkRetries: 0 })
  })
})


describe('explicit unprocessed Terminal cancellation', () => {
  it.each(['requires_payment_method', 'requires_confirmation'])('cancels and retires only the verified same %s intent with stable provider identity', async status => {
    mocks.retrieve.mockResolvedValue({ ...intent, status })
    expect(await cancelTerminalPaymentAttempt('pi_one')).toEqual({ success: true })
    expect(mocks.claim).toHaveBeenCalledWith({ invoiceId: 'inv_one', organizationId: 'org_one', method: 'terminal', invoiceWhere: { job: { organizationId: 'org_one', assignedUserId: 'tech_one' } } })
    expect(mocks.cancel).toHaveBeenCalledWith('pi_one', {}, { stripeAccount: 'acct_one', timeout: 10000, maxNetworkRetries: 0, idempotencyKey: 'terminal-cancel:pi_one' })
    expect(mocks.retire).toHaveBeenCalledWith(expect.objectContaining({ providerId: 'pi_one' }))
    expect(mocks.update).not.toHaveBeenCalled()
  })
  it.each(['requires_capture', 'processing', 'succeeded', 'requires_action'])('never cancels or retires %s', async status => {
    mocks.retrieve.mockResolvedValue({ ...intent, status, amount_received: status === 'succeeded' ? 5000 : 0 })
    expect((await cancelTerminalPaymentAttempt('pi_one')).success).toBe(false)
    expect(mocks.cancel).not.toHaveBeenCalled(); expect(mocks.retire).not.toHaveBeenCalled()
  })
  it('finishes durable retirement after a previous cancellation response was lost', async () => {
    mocks.retrieve.mockResolvedValue({ ...intent, status: 'canceled' })
    expect(await cancelTerminalPaymentAttempt('pi_one')).toEqual({ success: true })
    expect(mocks.cancel).not.toHaveBeenCalled(); expect(mocks.retire).toHaveBeenCalled()
  })
  it('leaves the attempt active when provider cancellation is uncertain', async () => {
    mocks.retrieve.mockResolvedValue(intent); mocks.cancel.mockRejectedValue(new Error('PRIVATE uncertain outcome'))
    expect(await cancelTerminalPaymentAttempt('pi_one')).toMatchObject({ success: false, error: expect.not.stringContaining('PRIVATE') })
    expect(mocks.retire).not.toHaveBeenCalled(); expect(mocks.release).toHaveBeenCalled()
  })
  it('does not retire an unverified provider cancellation response', async () => {
    mocks.retrieve.mockResolvedValue(intent); mocks.cancel.mockResolvedValue({ ...intent, status: 'processing' })
    expect((await cancelTerminalPaymentAttempt('pi_one')).success).toBe(false)
    expect(mocks.retire).not.toHaveBeenCalled()
  })
  it('does not cancel an intent claimed by another concurrent operation', async () => {
    mocks.claim.mockResolvedValue({ success: false, error: 'Payment in progress' })
    expect(await cancelTerminalPaymentAttempt('pi_one')).toEqual({ success: false, error: 'Payment in progress' })
    expect(mocks.retrieve).not.toHaveBeenCalled(); expect(mocks.cancel).not.toHaveBeenCalled()
  })
  it.each([{ organizationId: 'org_other' }, { method: 'checkout' }])('blocks payment ownership mismatch %o', async mismatch => {
    mocks.payment.mockResolvedValue({ ...payment, ...mismatch })
    expect((await cancelTerminalPaymentAttempt('pi_one')).success).toBe(false)
    expect(mocks.claim).not.toHaveBeenCalled()
  })
  it('blocks unassigned technicians and mismatched claimed provider IDs', async () => {
    mocks.job.mockResolvedValueOnce(null)
    expect((await cancelTerminalPaymentAttempt('pi_one')).success).toBe(false)
    mocks.claim.mockResolvedValue({ success: true, attempt: { ...attempt, providerId: 'pi_other' } })
    expect((await cancelTerminalPaymentAttempt('pi_one')).success).toBe(false)
    expect(mocks.retrieve).not.toHaveBeenCalled()
  })
  it('does not hide a successfully retired cancellation when optional audit fails', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.retrieve.mockResolvedValue(intent); mocks.audit.mockRejectedValue(new Error('PRIVATE audit'))
    expect(await cancelTerminalPaymentAttempt('pi_one')).toEqual({ success: true })
    expect(JSON.stringify(log.mock.calls)).not.toContain('PRIVATE')
  })
})
