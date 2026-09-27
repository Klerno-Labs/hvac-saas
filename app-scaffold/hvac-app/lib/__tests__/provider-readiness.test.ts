import { describe, expect, it, vi } from 'vitest'
import { inspectProviders, inspectWebhookCandidates, priceMatchesPlan, secureAppOrigin, verifiedSenderDomain } from '../provider-readiness'

describe('read-only provider readiness', () => {
  it('rejects test senders, malformed addresses and injected headers', () => {
    for (const sender of ['FieldClose <hi@resend.dev>', 'hi@sub.resend.dev', 'hello', 'hi@example.com\nBcc: bad@example.com']) expect(verifiedSenderDomain(sender)).toBeNull()
    expect(verifiedSenderDomain('FieldClose <hello@fieldclose.app>')).toBe('fieldclose.app')
  })
  it('requires a canonical secure app origin', () => {
    for (const url of ['http://fieldclose.app', 'https://user:secret@fieldclose.app', 'https://fieldclose.app/path', 'https://fieldclose.app/?token=secret']) expect(secureAppOrigin(url)).toBeNull()
    expect(secureAppOrigin('https://fieldclose.app')).toBe('https://fieldclose.app')
  })
  it('rejects inactive, test, annual and wrong-currency prices', () => {
    const price = { active: true, livemode: true, currency: 'usd', unit_amount: 4900, type: 'recurring', billing_scheme: 'per_unit', recurring: { interval: 'month', interval_count: 1, usage_type: 'licensed' }, product: { active: true } }
    expect(priceMatchesPlan(price, 4900)).toBe(true)
    for (const changed of [{ livemode: false }, { active: false }, { currency: 'eur' }, { unit_amount: 9900 }, { product: 'prod_unexpanded' }, { product: { active: false } }, { recurring: { interval: 'year', interval_count: 1 } },
      { recurring: { ...price.recurring, usage_type: 'metered' } }, { billing_scheme: 'tiered' }, { transform_quantity: { divide_by: 10, round: 'down' } }]) expect(priceMatchesPlan({ ...price, ...changed }, 4900)).toBe(false)
  })
  it('does not mistake one all-event destination for separate account scopes', () => {
    const endpoint = { id: 'we_one', url: 'https://fieldclose.app/api/stripe/webhook', status: 'enabled', livemode: true, api_version: '2025-02-24.acacia', enabled_events: ['*'] }
    expect(inspectWebhookCandidates([endpoint], 'https://fieldclose.app')[0].status).toBe('blocked')
    const two = inspectWebhookCandidates([endpoint, { ...endpoint, id: 'we_two' }], 'https://fieldclose.app')
    expect(two[0].status).toBe('passed')
    expect(two[1].status).toBe('unverified')
    expect(inspectWebhookCandidates([endpoint, { ...endpoint, id: 'we_two', api_version: '2026-03-25.dahlia' }], 'https://fieldclose.app')[0].status).toBe('blocked')
  })
  it('performs no provider calls with missing credentials or a test Stripe key', async () => {
    const request = vi.fn()
    const checkBucket = vi.fn()
    const checks = await inspectProviders({ env: { STRIPE_SECRET_KEY: 'sk_test_private', EMAIL_FROM: 'test@resend.dev' }, request, checkBucket })
    expect(request).not.toHaveBeenCalled()
    expect(checkBucket).not.toHaveBeenCalled()
    expect(checks.find(check => check.id === 'stripe.mode')?.status).toBe('blocked')
    expect(JSON.stringify(checks)).not.toContain('sk_test_private')
  })
  it('redacts provider failures and uses only GET with timeouts', async () => {
    const request = vi.fn().mockRejectedValue(new Error('sk_live_private RESEND_PRIVATE customer@example.test'))
    const checks = await inspectProviders({ env: { STRIPE_SECRET_KEY: 'sk_live_private', APP_URL: 'https://fieldclose.app', EMAIL_FROM: 'hi@fieldclose.app', RESEND_API_KEY: 'RESEND_PRIVATE' }, request, checkBucket: vi.fn() })
    expect(request).toHaveBeenCalled()
    for (const [, options] of request.mock.calls) {
      expect(options.method).toBe('GET')
      expect(options.signal).toBeInstanceOf(AbortSignal)
    }
    expect(JSON.stringify(checks)).not.toMatch(/sk_live_private|RESEND_PRIVATE|customer@example/)
    expect(checks.filter(check => check.status === 'unverified').length).toBeGreaterThan(1)
  })
  it('does not treat an unrelated verified sender domain as FieldClose', async () => {
    const request = vi.fn().mockResolvedValue(Response.json({ data: [{ id: 'another', name: 'another.app', status: 'verified' }], has_more: false }))
    const checks = await inspectProviders({ env: { EMAIL_FROM: 'hi@fieldclose.app', RESEND_API_KEY: 'private' }, request, checkBucket: vi.fn() })
    expect(checks.find(check => check.id === 'email.sender')?.status).toBe('blocked')
  })
})

const liveEnv = {
  APP_URL: 'https://fieldclose.app', STRIPE_SECRET_KEY: 'sk_live_fixture',
  STRIPE_STARTER_PRICE_ID: 'price_starter', STRIPE_PRO_PRICE_ID: 'price_pro',
  STRIPE_WEBHOOK_SECRET: 'whsec_platformFixture', STRIPE_CONNECT_WEBHOOK_SECRET: 'whsec_connectFixture',
  STRIPE_BILLING_PORTAL_CONFIGURATION_ID: 'bpc_fieldclose',
  EMAIL_FROM: 'FieldClose <hi@fieldclose.app>', RESEND_API_KEY: 'resend_private_fixture',
}
const enabledFeature = { enabled: true }
const fixturePrice = { active: true, livemode: true, currency: 'usd', type: 'recurring', billing_scheme: 'per_unit',
  recurring: { interval: 'month', interval_count: 1, usage_type: 'licensed' }, product: { active: true }, transform_quantity: null }
const fixturePortal = { active: true, livemode: true, default_return_url: 'https://fieldclose.app/settings/billing',
  features: { payment_method_update: enabledFeature, subscription_cancel: enabledFeature, subscription_update: { enabled: false } } }
const fixtureEndpoint = { url: 'https://fieldclose.app/api/stripe/webhook', status: 'enabled', livemode: true, api_version: '2025-02-24.acacia', enabled_events: ['*'] }
const bodies: Record<string, unknown> = {
  '/v1/account': { id: 'acct_fixture', charges_enabled: true, payouts_enabled: true, details_submitted: true, future_provider_field: 'not-a-readiness-claim' },
  '/v1/prices/price_starter': { ...fixturePrice, unit_amount: 4900 },
  '/v1/prices/price_pro': { ...fixturePrice, unit_amount: 9900 },
  '/v1/webhook_endpoints': { data: [{ ...fixtureEndpoint, id: 'we_one' }, { ...fixtureEndpoint, id: 'we_two' }], has_more: false },
  '/v1/billing_portal/configurations/bpc_fieldclose': fixturePortal,
  '/domains': { data: [{ id: 'domain_fixture', name: 'fieldclose.app' }], has_more: false },
  '/domains/domain_fixture': { name: 'fieldclose.app', status: 'verified', capabilities: { sending: 'enabled', receiving: 'disabled' } },
}
function requestWith(changes: Record<string, unknown> = {}) {
  return vi.fn(async (input: string | URL | Request) => {
    const path = new URL(typeof input === 'string' || input instanceof URL ? input : input.url).pathname
    return Response.json(Object.hasOwn(changes, path) ? changes[path] : bodies[path])
  })
}
describe('provider response evidence', () => {
  it('accepts additional provider fields without certifying webhook scope or delivery', async () => {
    const checks = await inspectProviders({ env: liveEnv, request: requestWith(), checkBucket: vi.fn() })
    for (const id of ['stripe.account', 'stripe.price.starter', 'stripe.price.pro', 'stripe.webhook_candidates', 'stripe.webhook_secrets', 'stripe.portal', 'email.sender']) {
      expect(checks.find(check => check.id === id)?.status, id).toBe('passed')
    }
    expect(checks.find(check => check.id === 'stripe.webhook_delivery')?.status).toBe('unverified')
    expect(checks.find(check => check.id === 'end_to_end')?.status).toBe('unverified')
    expect(JSON.stringify(checks)).not.toContain('not-a-readiness-claim')
    expect(JSON.stringify(checks)).not.toMatch(/sk_live_fixture|whsec_platformFixture|whsec_connectFixture|resend_private_fixture/)
  })

  it.each([
    ['stripe.account', '/v1/account', null],
    ['stripe.account', '/v1/account', { charges_enabled: 'true', payouts_enabled: true, details_submitted: true }],
    ['stripe.price.starter', '/v1/prices/price_starter', { ...fixturePrice, unit_amount: '4900' }],
    ['stripe.webhook_candidates', '/v1/webhook_endpoints', { data: [null], has_more: false }],
    ['stripe.webhook_candidates', '/v1/webhook_endpoints', { data: [] }],
    ['stripe.portal', '/v1/billing_portal/configurations/bpc_fieldclose', { ...fixturePortal, features: {} }],
    ['email.sender', '/domains', { data: [null], has_more: false }],
    ['email.sender', '/domains', { data: [], has_more: 'false' }],
    ['email.sender', '/domains/domain_fixture', { name: 'fieldclose.app', status: 'verified' }],
  ])('keeps %s unverified for a malformed body at %s', async (id, path, body) => {
    const checks = await inspectProviders({ env: liveEnv, request: requestWith({ [path as string]: body }), checkBucket: vi.fn() })
    expect(checks.find(check => check.id === id)?.status).toBe('unverified')
  })

  it.each([undefined, '', 'whsec_platformFixture', 'accidentally-pasted-private-value'])('blocks missing, reused or malformed Connect signing secrets', async connect => {
    const checks = await inspectProviders({ env: { ...liveEnv, STRIPE_CONNECT_WEBHOOK_SECRET: connect }, request: requestWith(), checkBucket: vi.fn() })
    expect(checks.find(check => check.id === 'stripe.webhook_secrets')?.status).toBe('blocked')
    expect(JSON.stringify(checks)).not.toContain('accidentally-pasted-private-value')
  })

  it('blocks a metered monthly price that cannot accept this checkout’s fixed quantity', async () => {
    const checks = await inspectProviders({ env: liveEnv, request: requestWith({ '/v1/prices/price_starter': { ...fixturePrice, unit_amount: 4900, recurring: { ...fixturePrice.recurring, usage_type: 'metered' } } }), checkBucket: vi.fn() })
    expect(checks.find(check => check.id === 'stripe.price.starter')?.status).toBe('blocked')
  })

  it('blocks portal price changes until the app reconciles plan entitlements from changed prices', async () => {
    const checks = await inspectProviders({ env: liveEnv, request: requestWith({ '/v1/billing_portal/configurations/bpc_fieldclose': { ...fixturePortal, features: { ...fixturePortal.features, subscription_update: enabledFeature } } }), checkBucket: vi.fn() })
    expect(checks.find(check => check.id === 'stripe.portal')?.status).toBe('blocked')
  })

  it('does not accept a different domain returned by the provider detail endpoint', async () => {
    const checks = await inspectProviders({ env: liveEnv, request: requestWith({ '/domains/domain_fixture': { name: 'another.app', status: 'verified', capabilities: { sending: 'enabled' } } }), checkBucket: vi.fn() })
    expect(checks.find(check => check.id === 'email.sender')?.status).toBe('blocked')
  })
})
