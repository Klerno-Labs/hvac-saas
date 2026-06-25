import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

describe('getRateLimitStore', () => {
  beforeEach(() => {
    vi.resetModules()
    delete process.env.UPSTASH_REDIS_REST_URL
    delete process.env.UPSTASH_REDIS_REST_TOKEN
  })

  afterEach(() => {
    delete process.env.UPSTASH_REDIS_REST_URL
    delete process.env.UPSTASH_REDIS_REST_TOKEN
  })

  it('returns RedisSlidingWindowStore when both Upstash vars are set', async () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://example.upstash.io'
    process.env.UPSTASH_REDIS_REST_TOKEN = 'tok'
    const { getRateLimitStore } = await import('./config')
    expect(getRateLimitStore().constructor.name).toBe('RedisSlidingWindowStore')
  })

  it('returns PrismaSlidingWindowStore when URL is missing', async () => {
    process.env.UPSTASH_REDIS_REST_TOKEN = 'tok'
    const { getRateLimitStore } = await import('./config')
    expect(getRateLimitStore().constructor.name).toBe('PrismaSlidingWindowStore')
  })

  it('returns PrismaSlidingWindowStore when token is missing', async () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://example.upstash.io'
    const { getRateLimitStore } = await import('./config')
    expect(getRateLimitStore().constructor.name).toBe('PrismaSlidingWindowStore')
  })
})
