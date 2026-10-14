import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ reserve: vi.fn(), save: vi.fn(), release: vi.fn(), retire: vi.fn(), create: vi.fn(), retrieve: vi.fn(), event: vi.fn() }))
vi.mock('@/lib/invoice-payment-attempt', () => ({ reserveInvoicePaymentAttempt: mocks.reserve, saveInvoicePaymentProviderId: mocks.save, releaseInvoicePaymentLease: mocks.release, retireInvoicePaymentAttempt: mocks.retire }))
vi.mock('@/lib/events', () => ({ trackEvent: mocks.event }))
import { startInvoiceCheckout } from '@/lib/invoice-checkout'
const invoice = { id: 'invoice1', organizationId: 'org1', invoiceNumber: 'INV-1', totalCents: 1100, outstandingCents: 1100, subtotalCents: 1000, taxCents: 100,
  organization: { platformFeePercent: 2.9 }, customer: { email: 'private@example.test' }, lineItems: [{ name: 'Service', description: null, quantity: 2, unitPriceCents: 500, lineTotalCents: 1000 }] }
const attempt = { id: 'attempt1', invoiceId: 'invoice1', organizationId: 'org1', method: 'checkout', connectedAccountId: 'acct1', amountCents: 1100, params: {}, providerId: null, leaseToken: 'lease1', createdAt: new Date() }
const session = () => ({ id: 'cs1', mode: 'payment', currency: 'usd', amount_total: 1100, status: 'open', payment_status: 'unpaid', url: 'https://checkout.stripe.com/fixture', payment_intent: null, metadata: { invoiceId: 'invoice1', organizationId: 'org1' } })
const input = { stripe: { checkout: { sessions: { create: mocks.create, retrieve: mocks.retrieve } } } as never, invoiceId: 'invoice1', organizationId: 'org1', customerId: 'customer1',
  returnUrls: { success: 'https://example.test/portal/private-token/done', cancel: 'https://example.test/portal/private-token/back' } }
beforeEach(() => {
  vi.resetAllMocks()
  mocks.reserve.mockImplementation(async args => {
    try { return { success: true, invoice, attempt: { ...attempt, params: args.buildParams(invoice) } } }
    catch { return { success: false, error: 'Invoice needs review' } }
  })
  mocks.create.mockResolvedValue(session()); mocks.retrieve.mockResolvedValue(session())
  mocks.save.mockResolvedValue(true); mocks.release.mockResolvedValue(true); mocks.retire.mockResolvedValue(true)
})
describe('shared online invoice payment initiation', () => {
  it('uses the durable attempt id, exact line totals and bounded connected-account call', async () => {
    expect(await startInvoiceCheckout(input)).toEqual({ success: true, checkoutUrl: session().url })
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ metadata: { invoiceId: 'invoice1', organizationId: 'org1' }, payment_intent_data: expect.objectContaining({ application_fee_amount: 32 }) }),
      { stripeAccount: 'acct1', timeout: 10_000, maxNetworkRetries: 0, idempotencyKey: 'invoice-payment:attempt1' })
    expect(mocks.save).toHaveBeenCalledWith(expect.anything(), 'cs1', { paymentIntentId: null })
    expect(mocks.reserve.mock.calls[0][0].customerPaymentCustomerId).toBe('customer1')
    expect(mocks.reserve.mock.calls[0][0].invoiceWhere).toEqual({ customerId: 'customer1', customer: { deletedAt: null } })
  })
  it('blocks adjusted or inconsistent totals before a provider request', async () => {
    for (const changed of [{ ...invoice, outstandingCents: 500 }, { ...invoice, subtotalCents: 999 }, { ...invoice, lineItems: [{ ...invoice.lineItems[0], quantity: 3 }] }]) {
      mocks.reserve.mockImplementationOnce(async args => { try { args.buildParams(changed); throw Error('unexpected') } catch { return { success: false, error: 'Invoice needs review' } } })
      expect((await startInvoiceCheckout(input)).success).toBe(false)
    }
    expect(mocks.create).not.toHaveBeenCalled()
  })
  it('does not call Stripe when another channel holds the invoice', async () => {
    mocks.reserve.mockResolvedValue({ success: false, error: 'Payment pending' })
    expect(await startInvoiceCheckout(input)).toEqual({ success: false, error: 'Payment pending' })
    expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.retrieve).not.toHaveBeenCalled()
  })
  it('reuses a saved session only after exact provider identity verification', async () => {
    mocks.reserve.mockResolvedValue({ success: true, invoice, attempt: { ...attempt, providerId: 'cs1' } })
    expect((await startInvoiceCheckout(input)).success).toBe(true)
    expect(mocks.retrieve).toHaveBeenCalledWith('cs1', { stripeAccount: 'acct1', timeout: 10_000, maxNetworkRetries: 0 })
    expect(mocks.create).not.toHaveBeenCalled()
  })
  it.each([{ metadata: { invoiceId: 'other', organizationId: 'org1' } }, { amount_total: 1200 }, { currency: 'eur' }, { mode: 'subscription' }])('fails closed for mismatched provider evidence: %j', async override => {
    mocks.retrieve.mockResolvedValue({ ...session(), ...override })
    mocks.reserve.mockResolvedValue({ success: true, invoice, attempt: { ...attempt, providerId: 'cs1' } })
    expect((await startInvoiceCheckout(input)).success).toBe(false)
    expect(mocks.save).not.toHaveBeenCalled(); expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.retire).not.toHaveBeenCalled()
  })
  it('retains an uncertain attempt rather than silently creating a replacement', async () => {
    mocks.create.mockRejectedValue(new Error('private-token private@example.test provider payload'))
    const result = await startInvoiceCheckout(input)
    expect(result.success).toBe(false); expect(JSON.stringify(result)).not.toMatch(/private-token|private@example|provider payload/)
    expect(mocks.release).toHaveBeenCalledOnce(); expect(mocks.retire).not.toHaveBeenCalled()
  })
  it('does not replace a complete session while webhook confirmation is pending', async () => {
    mocks.reserve.mockResolvedValue({ success: true, invoice, attempt: { ...attempt, providerId: 'cs1' } })
    mocks.retrieve.mockResolvedValue({ ...session(), status: 'complete', payment_status: 'paid' })
    expect(await startInvoiceCheckout(input)).toMatchObject({ success: false, error: expect.stringContaining('processing') })
    expect(mocks.retire).not.toHaveBeenCalled(); expect(mocks.create).not.toHaveBeenCalled()
  })
  it('starts a fresh attempt only after confirming and retiring the expired session', async () => {
    mocks.reserve.mockResolvedValueOnce({ success: true, invoice, attempt: { ...attempt, providerId: 'cs1' } })
    mocks.retrieve.mockResolvedValue({ ...session(), status: 'expired', payment_intent: 'pi_old' })
    expect((await startInvoiceCheckout(input)).success).toBe(true)
    expect(mocks.retire).toHaveBeenCalledWith(expect.objectContaining({ providerId: 'cs1' }), { paymentIntentId: 'pi_old' })
    expect(mocks.create).toHaveBeenCalledOnce()
  })
  it('does not expose a checkout URL if saving provider identity fails', async () => {
    mocks.save.mockResolvedValue(false)
    expect(await startInvoiceCheckout(input)).toMatchObject({ success: false })
    expect(mocks.release).toHaveBeenCalled(); expect(mocks.event).not.toHaveBeenCalled()
  })
  it('does not fabricate a failed payment setup when telemetry fails afterward', async () => {
    mocks.event.mockRejectedValue(new Error('private event'))
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    try { expect((await startInvoiceCheckout(input)).success).toBe(true); expect(log).toHaveBeenCalledWith('Payment setup activity could not be recorded') }
    finally { log.mockRestore() }
  })
})
