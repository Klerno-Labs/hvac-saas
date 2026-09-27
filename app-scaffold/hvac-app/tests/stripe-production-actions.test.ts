import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

const mocks = vi.hoisted(() => {
  vi.stubEnv('STRIPE_STARTER_PRICE_ID', 'price_fixture')
  return {
    construct: vi.fn(), auth: vi.fn(), admin: vi.fn(), access: vi.fn(), token: vi.fn(), limit: vi.fn(),
    organization: vi.fn(), invoice: vi.fn(), payment: vi.fn(), job: vi.fn(),
    organizationUpdate: vi.fn(), invoiceUpdate: vi.fn(), paymentCreate: vi.fn(), transaction: vi.fn(),
    event: vi.fn(), audit: vi.fn(),
  }
})
// Exercise the real getStripe boundary. No mock SDK client can contact a provider.
vi.mock('stripe', () => ({ default: mocks.construct }))
vi.mock('@/lib/session', () => ({ requireAuth: mocks.auth }))
vi.mock('@/lib/require-admin', () => ({ requireAdmin: mocks.admin }))
vi.mock('@/lib/mutation-access', () => ({ requireMutationAccess: mocks.access, jobAccessWhere: () => ({ organizationId: 'org_fixture' }) }))
vi.mock('@/lib/portal', () => ({ validatePortalToken: mocks.token }))
vi.mock('@/lib/db', () => ({ db: {
  organization: { findUnique: mocks.organization, update: mocks.organizationUpdate },
  invoice: { findFirst: mocks.invoice, update: mocks.invoiceUpdate },
  payment: { findUnique: mocks.payment, create: mocks.paymentCreate },
  job: { findFirst: mocks.job }, $transaction: mocks.transaction,
} }))
vi.mock('@/lib/events', () => ({ trackEvent: mocks.event }))
vi.mock('@/lib/audit', () => ({ logAudit: mocks.audit }))
vi.mock('@/lib/rate-limit', () => ({ limit: mocks.limit, RL: { publicPay: 'publicPay' }, extractIp: () => '127.0.0.1' }))
vi.mock('next/headers', () => ({ headers: async () => new Headers() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/app/settings/billing/subscribe-button', () => ({
  SubscribeButton: () => 'SUBSCRIBE_CONTROL', ManageBillingButton: () => 'MANAGE_BILLING_CONTROL',
}))

import { createSubscriptionCheckout } from '@/lib/billing'
import { POST as billingPortal } from '@/app/api/billing/portal/route'
import { startStripeOnboarding, refreshStripeStatus } from '@/app/settings/stripe/actions'
import { createCheckoutSession } from '@/app/invoices/[invoiceId]/payment-actions'
import { createPortalCheckoutSession } from '@/app/portal/[token]/invoices/[invoiceId]/payment-action'
import { createTerminalPaymentIntent, captureTerminalPayment, createTerminalConnectionToken } from '@/app/jobs/[jobId]/terminal-payment-actions'
import BillingPage from '@/app/settings/billing/page'

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('VERCEL_ENV', 'production')
  vi.stubEnv('STRIPE_SECRET_KEY', 'rk_test_fixture')
  vi.stubEnv('STRIPE_BILLING_PORTAL_CONFIGURATION_ID', '')
  const organization = {
    id: 'org_fixture', name: 'Fixture', stripeCustomerId: 'cus_fixture',
    stripeConnectedAccountId: 'acct_fixture', stripeChargesEnabled: true, stripeTerminalEnabled: true,
    plan: 'STARTER', subscriptionStatus: 'TRIALING', trialEndsAt: new Date(Date.now() + 86400000), platformFeePercent: 2.9,
  }
  const context = { organizationId: organization.id, role: 'owner', userId: 'owner', user: { email: 'owner@example.test' }, organization }
  mocks.auth.mockResolvedValue(context)
  mocks.access.mockResolvedValue({ authorized: true, context })
  mocks.admin.mockResolvedValue({ authorized: true, context })
  mocks.token.mockResolvedValue({ organizationId: organization.id, customerId: 'customer_fixture' })
  mocks.limit.mockResolvedValue({ allowed: true, remaining: 10, retryAfterSeconds: 0 })
  mocks.organization.mockResolvedValue(organization)
  const invoice = { id: 'invoice_fixture', organizationId: organization.id, jobId: 'job_fixture', status: 'sent', totalCents: 12500, outstandingCents: 12500, stripeCheckoutSessionId: 'cs_test_existing' }
  mocks.invoice.mockResolvedValue(invoice)
  mocks.payment.mockResolvedValue({ organizationId: organization.id, amountCents: 12500, invoice })
  mocks.job.mockResolvedValue({ id: 'job_fixture' })
})
afterEach(() => vi.unstubAllEnvs())

function expectNoProviderOrFinancialWrite() {
  expect(mocks.construct).not.toHaveBeenCalled()
  expect(mocks.organizationUpdate).not.toHaveBeenCalled()
  expect(mocks.invoiceUpdate).not.toHaveBeenCalled()
  expect(mocks.paymentCreate).not.toHaveBeenCalled()
  expect(mocks.transaction).not.toHaveBeenCalled()
  expect(mocks.event).not.toHaveBeenCalled()
  expect(mocks.audit).not.toHaveBeenCalled()
}

describe('production payment entry points fail closed with sandbox configuration', () => {
  it('does not reserve a subscription attempt or customer', async () => {
    expect(await createSubscriptionCheckout({ organizationId: 'org_fixture', planId: 'starter', userEmail: 'owner@example.test' })).toMatchObject({ error: expect.stringContaining('Subscriptions are temporarily unavailable') })
    expectNoProviderOrFinancialWrite()
  })

  it('returns a recoverable billing portal 503 without creating a customer', async () => {
    const response = await billingPortal()
    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({ error: expect.stringContaining('Billing is temporarily unavailable') })
    expectNoProviderOrFinancialWrite()
  })

  it.each([startStripeOnboarding, refreshStripeStatus])('blocks Connect setup or refresh without persisting capability claims', async action => {
    expect(await action()).toMatchObject({ success: false, error: expect.stringContaining('Customer payments are not configured') })
    expectNoProviderOrFinancialWrite()
  })

  it('cannot return or create an invoice checkout, including a saved test session', async () => {
    expect(await createCheckoutSession('invoice_fixture')).toMatchObject({ success: false, error: expect.stringContaining('Online payments are temporarily unavailable') })
    expectNoProviderOrFinancialWrite()
  })

  it('gives a customer an alternative without returning a saved sandbox checkout', async () => {
    expect(await createPortalCheckoutSession('valid_fixture', 'invoice_fixture')).toEqual({ success: false, error: 'Online payment is temporarily unavailable. Contact the business to arrange payment.' })
    expectNoProviderOrFinancialWrite()
  })

  it.each([
    ['create intent', () => createTerminalPaymentIntent('invoice_fixture')],
    ['capture intent', () => captureTerminalPayment('pi_fixture')],
    ['connection token', () => createTerminalConnectionToken()],
  ] as const)('blocks Terminal %s without recording a payment or capture', async (_name, action) => {
    expect(await action()).toMatchObject({ success: false, error: expect.stringContaining('Card payments are temporarily unavailable') })
    expectNoProviderOrFinancialWrite()
  })

  it('retains authorization checks ahead of payment availability', async () => {
    mocks.access.mockResolvedValue({ authorized: false, error: 'Not authorized' })
    mocks.token.mockResolvedValue(null)
    expect(await createCheckoutSession('invoice_fixture')).toEqual({ success: false, error: 'Not authorized' })
    expect(await createPortalCheckoutSession('invalid', 'invoice_fixture')).toEqual({ success: false, error: 'Invalid or expired portal link' })
    expectNoProviderOrFinancialWrite()
  })

  it('shows unavailable billing without subscription or portal controls and preserves the existing trial', async () => {
    const html = renderToStaticMarkup(await BillingPage())
    expect(html).toContain('Subscriptions and online payments are temporarily unavailable')
    expect(html).toContain('Trial ends')
    expect(html).not.toContain('SUBSCRIBE_CONTROL')
    expect(html).not.toContain('MANAGE_BILLING_CONTROL')
    expect(html).not.toContain('rk_test_fixture')
    expectNoProviderOrFinancialWrite()
  })

  it('leaves synthetic billing controls available on Preview without contacting Stripe', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview')
    const html = renderToStaticMarkup(await BillingPage())
    expect(html).toContain('SUBSCRIBE_CONTROL')
    expect(html).toContain('MANAGE_BILLING_CONTROL')
    expect(html).not.toContain('Subscriptions and online payments are temporarily unavailable')
    expectNoProviderOrFinancialWrite()
  })
})
