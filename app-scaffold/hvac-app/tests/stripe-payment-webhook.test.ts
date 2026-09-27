import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
vi.mock('next/headers', () => ({ headers: vi.fn(async () => new Headers({ 'stripe-signature': 'test' })) }))
vi.mock('@/lib/stripe', () => ({ getStripe: vi.fn() }))
vi.mock('@/lib/db', () => ({ db: {
  $transaction: vi.fn(), $queryRaw: vi.fn(),
  invoice: { findUnique: vi.fn(), updateMany: vi.fn() },
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
