import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

describe('getRateLimitStore', () => {
  const PREV_URL = process.env.UPSTASH_REDIS_REST_URL
  const PREV_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN

  beforeEach(() => {
    // Each test starts from a clean memoization + clean env.
    vi.resetModules()
    delete process.env.UPSTASH_REDIS_REST_URL
    delete process.env.UPSTASH_REDIS_REST_TOKEN
  })

  afterEach(() => {
    vi.restoreAllMocks()
    if (PREV_URL === undefined) delete process.env.UPSTASH_REDIS_REST_URL
    else process.env.UPSTASH_REDIS_REST_URL = PREV_URL
    if (PREV_TOKEN === undefined) delete process.env.UPSTASH_REDIS_REST_TOKEN
    else process.env.UPSTASH_REDIS_REST_TOKEN = PREV_TOKEN
  })

  it('returns a Prisma-backed store when neither Upstash var is set', async () => {
    const { getRateLimitStore, __resetRateLimitStoreCache } = await import('@/lib/rate-limit/config')
    __resetRateLimitStoreCache()
    const { PrismaSlidingWindowStore } = await import('@/lib/rate-limit/store')

    const store = getRateLimitStore()
    expect(store).toBeInstanceOf(PrismaSlidingWindowStore)
  })

  it('returns a Prisma-backed store when only URL is set', async () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://example.upstash.io'
    const { getRateLimitStore, __resetRateLimitStoreCache } = await import('@/lib/rate-limit/config')
    __resetRateLimitStoreCache()
    const { PrismaSlidingWindowStore } = await import('@/lib/rate-limit/store')

    const store = getRateLimitStore()
    expect(store).toBeInstanceOf(PrismaSlidingWindowStore)
  })

  it('returns a Prisma-backed store when only TOKEN is set', async () => {
    process.env.UPSTASH_REDIS_REST_TOKEN = 'some-token'
    const { getRateLimitStore, __resetRateLimitStoreCache } = await import('@/lib/rate-limit/config')
    __resetRateLimitStoreCache()
    const { PrismaSlidingWindowStore } = await import('@/lib/rate-limit/store')

    const store = getRateLimitStore()
    expect(store).toBeInstanceOf(PrismaSlidingWindowStore)
  })

  it('returns a Redis-backed store when BOTH Upstash vars are set', async () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://example.upstash.io'
    process.env.UPSTASH_REDIS_REST_TOKEN = 'some-token'
    const { getRateLimitStore, __resetRateLimitStoreCache } = await import('@/lib/rate-limit/config')
    __resetRateLimitStoreCache()
    const { RedisSlidingWindowStore } = await import('@/lib/rate-limit/redis-store')

    const store = getRateLimitStore()
    expect(store).toBeInstanceOf(RedisSlidingWindowStore)
  })

  it('memoizes the same store instance across calls', async () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://example.upstash.io'
    process.env.UPSTASH_REDIS_REST_TOKEN = 'some-token'
    const { getRateLimitStore, __resetRateLimitStoreCache } = await import('@/lib/rate-limit/config')
    __resetRateLimitStoreCache()

    expect(getRateLimitStore()).toBe(getRateLimitStore())
  })

  it('re-evaluates env after the cache is reset', async () => {
    const mod = await import('@/lib/rate-limit/config')
    mod.__resetRateLimitStoreCache()
    const { PrismaSlidingWindowStore } = await import('@/lib/rate-limit/store')

    // No env → Prisma.
    const first = mod.getRateLimitStore()
    expect(first).toBeInstanceOf(PrismaSlidingWindowStore)

    // Flip env on, reset cache → Redis.
    process.env.UPSTASH_REDIS_REST_URL = 'https://example.upstash.io'
    process.env.UPSTASH_REDIS_REST_TOKEN = 'some-token'
    mod.__resetRateLimitStoreCache()
    const { RedisSlidingWindowStore } = await import('@/lib/rate-limit/redis-store')

    const second = mod.getRateLimitStore()
    expect(second).toBeInstanceOf(RedisSlidingWindowStore)
    expect(second).not.toBe(first)
  })
})

describe('RL presets', () => {
  it('exposes exactly the four in-scope buckets with sane conservative defaults', async () => {
    const { RL } = await import('@/lib/rate-limit/config')
    expect(Object.keys(RL).sort()).toEqual(
      ['login', 'passwordReset', 'portalToken', 'publicPay'].sort(),
    )
    expect(RL.login).toEqual({ bucket: 'auth:login', windowMs: 15 * 60_000, max: 10 })
    expect(RL.passwordReset).toEqual({ bucket: 'auth:password-reset', windowMs: 60 * 60_000, max: 5 })
    expect(RL.portalToken).toEqual({ bucket: 'portal:token', windowMs: 15 * 60_000, max: 20 })
    expect(RL.publicPay).toEqual({ bucket: 'public:pay', windowMs: 60_000, max: 12 })
  })
})
