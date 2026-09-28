import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }))
import { captureException } from '@sentry/nextjs'
vi.mock('next/headers', () => ({ headers: vi.fn(async () => new Headers({ 'stripe-signature': 'test' })) }))
vi.mock('@/lib/stripe', () => ({ getStripe: vi.fn() }))
vi.mock('@/lib/db', () => ({ db: {
  $transaction: vi.fn(), $queryRaw: vi.fn(),
  invoice: { findUnique: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn() },
  payment: { findUnique: vi.fn(), updateMany: vi.fn() },
  organization: { findFirst: vi.fn(), update: vi.fn() },
} }))
vi.mock('@/lib/events', () => ({ trackEvent: vi.fn() }))
vi.mock('@/lib/audit', () => ({ logAudit: vi.fn() }))
vi.mock('@/lib/payment-reconciliation', () => ({ reconcileConfirmedPayment: vi.fn() }))
vi.mock('@/app/api/billing/webhook/route', () => ({ POST: vi.fn() }))
import { getStripe } from '@/lib/stripe'
import { db } from '@/lib/db'
import { trackEvent } from '@/lib/events'
import { reconcileConfirmedPayment } from '@/lib/payment-reconciliation'
import { POST as billingWebhook } from '@/app/api/billing/webhook/route'
import { POST } from '@/app/api/stripe/webhook/route'

const constructEvent = vi.fn()
const request = () => new Request('http://localhost/api/stripe/webhook', { method: 'POST', body: '{}' })
function event(type = 'checkout.session.completed', overrides = {}) {
  return { id: 'evt_fixture', account: 'acct_fixture', livemode: false, type, data: { object: {
    id: 'cs_fixture', mode: 'payment', payment_status: 'paid',
    metadata: { invoiceId: 'invoice_1', organizationId: 'org_1' },
    payment_intent: 'pi_fixture', currency: 'usd', amount_total: 12500, ...overrides,
  } } }
}
function signedEvent(payload = event(), scope = 'connect') {
  constructEvent.mockImplementation((_body, _signature, secret) => {
    if (secret !== `whsec_${scope}`) throw new Error('Signature mismatch')
    return payload
  })
}
const invoice = { id: 'invoice_1', organizationId: 'org_1', status: 'sent', totalCents: 12500,
  stripeCheckoutSessionId: 'cs_fixture', organization: { stripeConnectedAccountId: 'acct_fixture' } }
const payment = { id: 'payment_1', invoiceId: 'invoice_1', organizationId: 'org_1', status: 'pending',
  amountCents: 12500, currency: 'usd' }

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_platform')
  vi.stubEnv('STRIPE_CONNECT_WEBHOOK_SECRET', 'whsec_connect')
  vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_fixture')
  vi.mocked(getStripe).mockReturnValue({ webhooks: { constructEvent } } as never)
  vi.mocked(db.$transaction).mockImplementation(async (fn: any) => fn(db))
  vi.mocked(db.invoice.findUnique).mockResolvedValue(invoice as never)
  vi.mocked(db.invoice.updateMany).mockResolvedValue({ count: 1 })
  vi.mocked(db.payment.findUnique).mockResolvedValue(payment as never)
  vi.mocked(db.payment.updateMany).mockResolvedValue({ count: 1 })
  signedEvent()
})
afterEach(() => vi.unstubAllEnvs())

describe('Stripe settlement boundary', () => {
  it('does not mark an unpaid checkout as settled', async () => {
    signedEvent(event('checkout.session.completed', { payment_status: 'unpaid' }))
    expect((await POST(request())).status).toBe(200)
    expect(reconcileConfirmedPayment).not.toHaveBeenCalled()
  })
  it('handles delayed payment settlement signed by the Connect destination', async () => {
    signedEvent(event('checkout.session.async_payment_succeeded'))
    expect((await POST(request())).status).toBe(200)
    expect(reconcileConfirmedPayment).toHaveBeenCalledWith({ invoiceId: 'invoice_1', organizationId: 'org_1',
      connectedAccountId: 'acct_fixture', paymentIntentId: 'pi_fixture', amountCents: 12500, currency: 'usd', method: 'checkout', livemode: false })
  })
  it('passes verified live mode through to the durable settlement audit', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_live_fixture')
    signedEvent({ ...event(), livemode: true })
    expect((await POST(request())).status).toBe(200)
    expect(reconcileConfirmedPayment).toHaveBeenCalledWith(expect.objectContaining({ livemode: true, connectedAccountId: 'acct_fixture' }))
  })
  it('rejects an invalid signature before invoking accounting', async () => {
    constructEvent.mockImplementation(() => { throw new Error('bad signature') })
    expect((await POST(request())).status).toBe(400)
    expect(reconcileConfirmedPayment).not.toHaveBeenCalled()
  })
  it('retries failed accounting instead of acknowledging success', async () => {
    vi.mocked(reconcileConfirmedPayment).mockRejectedValue(new Error('database unavailable'))
    expect((await POST(request())).status).toBe(500)
  })
  it('ignores subscription checkouts for invoice reconciliation', async () => {
    signedEvent(event('checkout.session.completed', { mode: 'subscription' }))
    expect((await POST(request())).status).toBe(200)
    expect(reconcileConfirmedPayment).not.toHaveBeenCalled()
  })
  it('never forwards connected-account subscriptions to platform billing', async () => {
    signedEvent(event('customer.subscription.updated'))
    expect((await POST(request())).status).toBe(200)
    expect(billingWebhook).not.toHaveBeenCalled()
    expect(trackEvent).not.toHaveBeenCalled()
    expect(db.$transaction).not.toHaveBeenCalled()
  })
  it('preserves platform billing on the original shared URL using the platform secret', async () => {
    signedEvent({ ...event('customer.subscription.updated'), account: undefined } as never, 'platform')
    vi.mocked(billingWebhook).mockResolvedValue(new Response('{}', { status: 200 }) as never)
    expect((await POST(request())).status).toBe(200)
    expect(billingWebhook).toHaveBeenCalledOnce()
    expect(reconcileConfirmedPayment).not.toHaveBeenCalled()
  })
  it('does not accept platform-signed events claiming a connected account', async () => {
    signedEvent(event(), 'platform')
    expect((await POST(request())).status).toBe(400)
    expect(reconcileConfirmedPayment).not.toHaveBeenCalled()
  })
  it('never marks a platform payment as a connected-account invoice payment', async () => {
    signedEvent({ ...event(), account: undefined } as never, 'platform')
    expect((await POST(request())).status).toBe(200)
    expect(reconcileConfirmedPayment).not.toHaveBeenCalled()
  })
  it('ignores test events in a live deployment before any application activity', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_live_fixture')
    expect((await POST(request())).status).toBe(200)
    expect(reconcileConfirmedPayment).not.toHaveBeenCalled()
    expect(trackEvent).not.toHaveBeenCalled()
    expect(db.$transaction).not.toHaveBeenCalled()
  })
  it('rejects an account update whose object belongs to another account', async () => {
    signedEvent(event('account.updated', { id: 'acct_other' }))
    expect((await POST(request())).status).toBe(500)
    expect(db.organization.findFirst).not.toHaveBeenCalled()
    expect(db.organization.update).not.toHaveBeenCalled()
  })
})

describe('failed and expired payment identity', () => {
  it.each(['checkout.session.expired', 'payment_intent.payment_failed'])('rejects a different account for %s', async type => {
    signedEvent({ ...event(type), account: 'acct_other' })
    expect((await POST(request())).status).toBe(500)
    expect(db.invoice.updateMany).not.toHaveBeenCalled()
    expect(db.payment.updateMany).not.toHaveBeenCalled()
  })
  it.each(['checkout.session.expired', 'payment_intent.payment_failed'])('rejects a different organization for %s', async type => {
    signedEvent(event(type, { metadata: { invoiceId: 'invoice_1', organizationId: 'org_other' } }))
    expect((await POST(request())).status).toBe(500)
    expect(db.invoice.updateMany).not.toHaveBeenCalled()
    expect(db.payment.updateMany).not.toHaveBeenCalled()
  })
  it('rejects a payment linked to another invoice before clearing checkout', async () => {
    signedEvent(event('checkout.session.expired'))
    vi.mocked(db.payment.findUnique).mockResolvedValue({ ...payment, invoiceId: 'invoice_other' } as never)
    expect((await POST(request())).status).toBe(500)
    expect(db.invoice.updateMany).not.toHaveBeenCalled()
    expect(db.payment.updateMany).not.toHaveBeenCalled()
  })
  it('only changes a matching pending payment and the current checkout session', async () => {
    signedEvent(event('checkout.session.expired'))
    expect((await POST(request())).status).toBe(200)
    expect(db.$queryRaw).toHaveBeenCalled()
    expect(db.invoice.updateMany).toHaveBeenCalledWith({ where: { id: 'invoice_1', organizationId: 'org_1',
      stripeCheckoutSessionId: 'cs_fixture', status: { not: 'paid' } }, data: { stripeCheckoutSessionId: null } })
    expect(db.payment.updateMany).toHaveBeenCalledWith({ where: { id: 'payment_1', invoiceId: 'invoice_1',
      organizationId: 'org_1', status: 'pending' }, data: { status: 'failed' } })
  })
  it('does not downgrade a payment after invoice settlement', async () => {
    signedEvent(event('payment_intent.payment_failed', { id: 'pi_fixture' }))
    vi.mocked(db.invoice.findUnique).mockResolvedValue({ ...invoice, status: 'paid' } as never)
    expect((await POST(request())).status).toBe(200)
    expect(db.payment.updateMany).not.toHaveBeenCalled()
  })
  it('does not record the same invoice failure twice when all state changes are already applied', async () => {
    signedEvent(event('checkout.session.expired'))
    vi.mocked(db.invoice.updateMany).mockResolvedValue({ count: 0 })
    vi.mocked(db.payment.updateMany).mockResolvedValue({ count: 0 })
    expect((await POST(request())).status).toBe(200)
    expect(trackEvent).not.toHaveBeenCalledWith(expect.objectContaining({ eventName: 'invoice_payment_failed' }), expect.anything())
  })
})

describe('shared-platform Connect association', () => {
  function unrelatedRecords() {
    vi.mocked(db.invoice.findUnique).mockResolvedValue(null)
    vi.mocked(db.invoice.findFirst).mockResolvedValue(null)
    vi.mocked(db.organization.findFirst).mockResolvedValue(null)
    vi.mocked(db.payment.findUnique).mockResolvedValue(null)
  }
  function expectNoApplicationWrite() {
    expect(db.$transaction).not.toHaveBeenCalled()
    expect(db.invoice.updateMany).not.toHaveBeenCalled()
    expect(db.payment.updateMany).not.toHaveBeenCalled()
    expect(db.organization.update).not.toHaveBeenCalled()
    expect(reconcileConfirmedPayment).not.toHaveBeenCalled()
    expect(trackEvent).not.toHaveBeenCalled()
  }

  it.each(['checkout.session.completed', 'checkout.session.async_payment_succeeded', 'checkout.session.expired', 'payment_intent.payment_failed'])('acknowledges unrelated %s without retries or activity writes', async type => {
    unrelatedRecords()
    signedEvent(event(type, { metadata: {} }))
    expect(await (await POST(request())).json()).toEqual({ received: true, ignored: true })
    expectNoApplicationWrite()
  })

  it('does not treat another app’s generic invoice and organization metadata as local identity', async () => {
    unrelatedRecords()
    signedEvent(event('checkout.session.completed', { metadata: { invoiceId: 'other_invoice', organizationId: 'other_org' } }))
    expect(await (await POST(request())).json()).toEqual({ received: true, ignored: true })
    expectNoApplicationWrite()
  })

  it('ignores Terminal-looking payments unrelated to any FieldClose record', async () => {
    unrelatedRecords()
    signedEvent(event('payment_intent.succeeded', { id: 'pi_other', status: 'succeeded', metadata: { method: 'terminal' } }))
    expect(await (await POST(request())).json()).toEqual({ received: true, ignored: true })
    expectNoApplicationWrite()
  })

  it('retries a saved Terminal payment with missing method metadata', async () => {
    unrelatedRecords()
    vi.mocked(db.payment.findUnique).mockResolvedValue({ ...payment, method: 'terminal' } as never)
    signedEvent(event('payment_intent.succeeded', { id: 'pi_fixture', status: 'succeeded', metadata: {} }))
    expect((await POST(request())).status).toBe(500)
    expectNoApplicationWrite()
  })

  it('keeps ordinary Checkout PaymentIntent success delegated to the Checkout event', async () => {
    vi.mocked(db.payment.findUnique).mockResolvedValue({ ...payment, method: 'checkout' } as never)
    signedEvent(event('payment_intent.succeeded', { id: 'pi_fixture', status: 'succeeded', metadata: {} }))
    expect(await (await POST(request())).json()).toEqual({ received: true, ignored: true })
    expectNoApplicationWrite()
  })

  it('ignores account updates for other Pegrio products without writing activity', async () => {
    unrelatedRecords()
    signedEvent(event('account.updated', { id: 'acct_fixture', charges_enabled: true, payouts_enabled: true }))
    expect(await (await POST(request())).json()).toEqual({ received: true, ignored: true })
    expectNoApplicationWrite()
  })

  it('still refreshes the exact connected account belonging to a FieldClose organization', async () => {
    vi.mocked(db.organization.findFirst).mockResolvedValue({ id: 'org_1', stripeChargesEnabled: false } as never)
    signedEvent(event('account.updated', { id: 'acct_fixture', charges_enabled: true, payouts_enabled: true }))
    expect((await POST(request())).status).toBe(200)
    expect(db.organization.update).toHaveBeenCalledWith({ where: { id: 'org_1' }, data: { stripeChargesEnabled: true, stripePayoutsEnabled: true } })
  })

  it.each(['checkout.session.completed', 'checkout.session.expired'])('retries %s with missing metadata if the session is stored on our invoice', async type => {
    unrelatedRecords()
    vi.mocked(db.invoice.findFirst).mockResolvedValue(invoice as never)
    signedEvent(event(type, { metadata: {} }))
    expect((await POST(request())).status).toBe(500)
    expectNoApplicationWrite()
  })

  it('retries a failed saved PaymentIntent with lost metadata instead of discarding our payment', async () => {
    unrelatedRecords()
    vi.mocked(db.payment.findUnique).mockResolvedValue(payment as never)
    signedEvent(event('payment_intent.payment_failed', { id: 'pi_fixture', metadata: {} }))
    expect((await POST(request())).status).toBe(500)
    expectNoApplicationWrite()
  })

  it('retries incomplete payment identity that explicitly references our organization', async () => {
    unrelatedRecords()
    vi.mocked(db.organization.findFirst).mockResolvedValue({ id: 'org_1' } as never)
    signedEvent(event('checkout.session.completed', { metadata: { organizationId: 'org_1' } }))
    expect((await POST(request())).status).toBe(500)
    expectNoApplicationWrite()
  })

  it('keeps database association failures retryable', async () => {
    const failure = new Error('Database unavailable')
    vi.mocked(db.invoice.findUnique).mockRejectedValue(failure)
    expect((await POST(request())).status).toBe(500)
    expect(captureException).toHaveBeenCalledExactlyOnceWith(failure)
    expectNoApplicationWrite()
  })

  it('does not send acknowledged foreign events or invalid signatures to error monitoring', async () => {
    unrelatedRecords()
    signedEvent(event('checkout.session.completed', { metadata: {} }))
    expect((await POST(request())).status).toBe(200)
    constructEvent.mockImplementation(() => { throw new Error('Invalid signature') })
    expect((await POST(request())).status).toBe(400)
    expect(captureException).not.toHaveBeenCalled()
  })
})
