import Stripe from 'stripe'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('@/lib/stripe', () => ({ getStripe: vi.fn() }))
import { getStripe } from '@/lib/stripe'
import { verifyStripeWebhook } from '@/lib/stripe-webhook'

// Real Stripe SDK signatures; these are deliberately fake local-only fixtures.
const stripe = new Stripe('sk_test_local_fixture')
const platformSecret = 'whsec_platform_fixture'
const connectSecret = 'whsec_connect_fixture'
function signed(secret: string, overrides: Record<string, unknown> = {}) {
  const body = JSON.stringify({ id: 'evt_fixture', object: 'event', type: 'checkout.session.completed',
    account: 'acct_fixture', livemode: false, data: { object: {} }, ...overrides })
  return { body, signature: stripe.webhooks.generateTestHeaderString({ payload: body, secret }) }
}
beforeEach(() => {
  vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_local_fixture')
  vi.stubEnv('STRIPE_WEBHOOK_SECRET', platformSecret)
  vi.stubEnv('STRIPE_CONNECT_WEBHOOK_SECRET', connectSecret)
  vi.mocked(getStripe).mockReturnValue(stripe)
})
afterEach(() => vi.unstubAllEnvs())

describe('Stripe destination signature and scope isolation', () => {
  it('verifies connected-account events only with their distinct secret', () => {
    const { body, signature } = signed(connectSecret)
    expect(verifyStripeWebhook(body, signature, ['platform', 'connect'])).toMatchObject({ verified: true, scope: 'connect', modeMatches: true })
    expect(verifyStripeWebhook(body, signature, ['platform'])).toMatchObject({ verified: false, status: 400 })
  })
  it('verifies platform events only with their distinct secret', () => {
    const { body, signature } = signed(platformSecret, { account: undefined, type: 'customer.subscription.updated' })
    expect(verifyStripeWebhook(body, signature, ['platform', 'connect'])).toMatchObject({ verified: true, scope: 'platform', modeMatches: true })
    expect(verifyStripeWebhook(body, signature, ['connect'])).toMatchObject({ verified: false, status: 400 })
  })
  it('rejects a platform signature claiming a connected account', () => {
    const { body, signature } = signed(platformSecret)
    expect(verifyStripeWebhook(body, signature, ['platform', 'connect'])).toMatchObject({ verified: false, status: 400 })
  })
  it('rejects a Connect signature without a connected account', () => {
    const { body, signature } = signed(connectSecret, { account: undefined })
    expect(verifyStripeWebhook(body, signature, ['platform', 'connect'])).toMatchObject({ verified: false, status: 400 })
  })
  it('rejects a tampered raw request body', () => {
    const { body, signature } = signed(connectSecret)
    expect(verifyStripeWebhook(body.replace('acct_fixture', 'acct_victim'), signature, ['platform', 'connect'])).toMatchObject({ verified: false, status: 400 })
  })
  it('rejects shared secrets instead of making account scope ambiguous', () => {
    vi.stubEnv('STRIPE_CONNECT_WEBHOOK_SECRET', platformSecret)
    const { body, signature } = signed(platformSecret)
    expect(verifyStripeWebhook(body, signature, ['platform', 'connect'])).toMatchObject({ verified: false, status: 503 })
  })
  it('never falls back to the platform secret when Connect is unconfigured', () => {
    vi.stubEnv('STRIPE_CONNECT_WEBHOOK_SECRET', '')
    const { body, signature } = signed(platformSecret)
    expect(verifyStripeWebhook(body, signature, ['platform', 'connect'])).toMatchObject({ verified: false, status: 400 })
  })
  it('distinguishes both directions of a test/live mode mismatch', () => {
    const live = signed(connectSecret, { livemode: true })
    expect(verifyStripeWebhook(live.body, live.signature, ['connect'])).toMatchObject({ verified: true, modeMatches: false })
    vi.stubEnv('STRIPE_SECRET_KEY', 'rk_live_local_fixture')
    const test = signed(connectSecret)
    expect(verifyStripeWebhook(test.body, test.signature, ['connect'])).toMatchObject({ verified: true, modeMatches: false })
  })
  it('fails closed if the mode is unknown or missing', () => {
    const malformed = signed(connectSecret, { livemode: undefined })
    expect(verifyStripeWebhook(malformed.body, malformed.signature, ['connect'])).toMatchObject({ verified: false, status: 400 })
    vi.stubEnv('STRIPE_SECRET_KEY', '')
    const valid = signed(connectSecret)
    expect(verifyStripeWebhook(valid.body, valid.signature, ['connect'])).toMatchObject({ verified: false, status: 503 })
  })
})
