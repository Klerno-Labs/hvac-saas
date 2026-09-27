import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const provider = vi.hoisted(() => ({ construct: vi.fn() }))
vi.mock('stripe', () => ({ default: provider.construct }))
import { getStripeRuntimeAvailability } from '@/lib/stripe-runtime'

beforeEach(() => {
  vi.resetModules()
  provider.construct.mockReset().mockImplementation(function () { return { fixture: true } })
  vi.stubEnv('VERCEL_ENV', 'production')
})
afterEach(() => vi.unstubAllEnvs())

describe('Stripe runtime environment boundary', () => {
  it.each(['sk_test_fixture', 'rk_test_fixture', 'unknown', 'pk_live_fixture', 'sk_live_', 'sk_live_bad key', '', undefined])('rejects production credential %s before constructing a client', async key => {
    vi.stubEnv('STRIPE_SECRET_KEY', key)
    const { getStripe } = await import('@/lib/stripe')
    expect(() => getStripe()).toThrow('Online payments are unavailable')
    expect(provider.construct).not.toHaveBeenCalled()
  })

  it.each(['sk_live_fixture', 'rk_live_fixture'])('accepts production live credential %s and reuses only its client', async key => {
    vi.stubEnv('STRIPE_SECRET_KEY', key)
    const { getStripe } = await import('@/lib/stripe')
    const first = getStripe()
    expect(getStripe()).toBe(first)
    expect(provider.construct).toHaveBeenCalledExactlyOnceWith(key, { apiVersion: '2025-02-24.acacia' })
  })

  it.each(['preview', 'development', undefined])('retains synthetic test access in %s', async environment => {
    vi.stubEnv('VERCEL_ENV', environment)
    vi.stubEnv('STRIPE_SECRET_KEY', 'rk_test_fixture')
    const { getStripe } = await import('@/lib/stripe')
    expect(getStripe()).toBeDefined()
    expect(provider.construct).toHaveBeenCalledTimes(1)
  })

  it('does not reuse a cached test client after the environment becomes production', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview')
    vi.stubEnv('STRIPE_SECRET_KEY', 'rk_test_fixture')
    const { getStripe } = await import('@/lib/stripe')
    getStripe()
    vi.stubEnv('VERCEL_ENV', 'production')
    expect(() => getStripe()).toThrow('Online payments are unavailable')
    expect(provider.construct).toHaveBeenCalledTimes(1)
  })

  it('replaces a cached client when its credential changes, including sandbox to live', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview')
    vi.stubEnv('STRIPE_SECRET_KEY', 'rk_test_fixture')
    const { getStripe } = await import('@/lib/stripe')
    const testClient = getStripe()
    vi.stubEnv('VERCEL_ENV', 'production')
    vi.stubEnv('STRIPE_SECRET_KEY', 'rk_live_fixture')
    expect(getStripe()).not.toBe(testClient)
    expect(provider.construct).toHaveBeenNthCalledWith(2, 'rk_live_fixture', { apiVersion: '2025-02-24.acacia' })
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_live_rotated')
    getStripe()
    expect(provider.construct).toHaveBeenCalledTimes(3)
  })

  it('does not reuse a cached live client if its credential is removed', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'rk_live_fixture')
    const { getStripe } = await import('@/lib/stripe')
    getStripe()
    vi.stubEnv('STRIPE_SECRET_KEY', undefined)
    expect(() => getStripe()).toThrow('Online payments are unavailable')
    expect(provider.construct).toHaveBeenCalledTimes(1)
  })

  it('returns only safe capability and mode fields', () => {
    expect(getStripeRuntimeAvailability({ VERCEL_ENV: 'production', STRIPE_SECRET_KEY: 'rk_test_fixture' })).toEqual({ available: false, mode: 'test' })
    expect(getStripeRuntimeAvailability({ VERCEL_ENV: 'production', STRIPE_SECRET_KEY: 'rk_live_fixture' })).toEqual({ available: true, mode: 'live' })
  })

  it('reports unavailable webhook configuration before signature construction', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'rk_test_fixture')
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_fixture')
    const { verifyStripeWebhook } = await import('@/lib/stripe-webhook')
    expect(verifyStripeWebhook('{}', 'signature', ['platform'])).toEqual({ verified: false, error: 'Stripe payment configuration is unavailable', status: 503 })
    expect(provider.construct).not.toHaveBeenCalled()
  })
})


describe('self-hosted production payments', () => {
  it('rejects sandbox keys without a Vercel environment marker', async () => {
    vi.stubEnv('VERCEL_ENV', undefined)
    vi.stubEnv('DEPLOYMENT_ENV', 'production')
    vi.stubEnv('STRIPE_SECRET_KEY', 'rk_test_fixture')
    const { getStripe } = await import('@/lib/stripe')
    expect(() => getStripe()).toThrow('Online payments are unavailable')
    expect(provider.construct).not.toHaveBeenCalled()
  })
  it('accepts live keys and preserves an existing production boundary', () => {
    expect(getStripeRuntimeAvailability({ DEPLOYMENT_ENV: 'production', STRIPE_SECRET_KEY: 'rk_live_fixture' }).available).toBe(true)
    expect(getStripeRuntimeAvailability({ DEPLOYMENT_ENV: 'preview', VERCEL_ENV: 'production', STRIPE_SECRET_KEY: 'rk_test_fixture' }).available).toBe(false)
  })
})
