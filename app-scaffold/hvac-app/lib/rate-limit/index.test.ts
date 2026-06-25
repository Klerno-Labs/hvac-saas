import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

import {
  getClientIp,
  hashIdentifier,
  limit,
  type LimitOptions,
} from '@/lib/rate-limit'
import type { RateLimitDecision, SlidingWindowStore } from '@/lib/rate-limit/store'

/**
 * In-memory fake store so tests don't touch Prisma or Upstash. Records every
 * `hit()` call to assert the identifier is composed correctly.
 */
function makeFakeStore(decision: RateLimitDecision): SlidingWindowStore & {
  calls: Array<{ bucket: string; identifier: string; windowMs: number; max: number }>
} {
  const calls: Array<{ bucket: string; identifier: string; windowMs: number; max: number }> = []
  return {
    calls,
    async hit(opts) {
      calls.push({ ...opts })
      return { ...decision }
    },
  }
}

describe('getClientIp', () => {
  it('takes the first hop of x-forwarded-for', () => {
    const headers = new Headers({ 'x-forwarded-for': '203.0.113.4, 10.0.0.1, 192.168.1.1' })
    expect(getClientIp(headers)).toBe('203.0.113.4')
  })

  it('trims whitespace around the first hop', () => {
    const headers = new Headers({ 'x-forwarded-for': ' 203.0.113.4 ,10.0.0.1' })
    expect(getClientIp(headers)).toBe('203.0.113.4')
  })

  it('falls back to x-real-ip when x-forwarded-for is absent', () => {
    const headers = new Headers({ 'x-real-ip': '198.51.100.7' })
    expect(getClientIp(headers)).toBe('198.51.100.7')
  })

  it('prefers x-forwarded-for over x-real-ip', () => {
    const headers = new Headers({
      'x-forwarded-for': '203.0.113.4',
      'x-real-ip': '198.51.100.7',
    })
    expect(getClientIp(headers)).toBe('203.0.113.4')
  })

  it('returns 0.0.0.0 when neither header is present', () => {
    expect(getClientIp(new Headers())).toBe('0.0.0.0')
  })

  it('returns 0.0.0.0 when x-forwarded-for is empty/blank', () => {
    expect(getClientIp(new Headers({ 'x-forwarded-for': ' ' }))).toBe('0.0.0.0')
  })

  it('accepts a Request object as well as Headers', () => {
    const req = new Request('https://example.com', {
      headers: { 'x-forwarded-for': '203.0.113.9' },
    })
    expect(getClientIp(req)).toBe('203.0.113.9')
  })
})

describe('hashIdentifier', () => {
  it('produces lowercase hex of length 64', () => {
    expect(hashIdentifier('user@example.com')).toMatch(/^[0-9a-f]{64}$/)
  })

  it('is deterministic for the same input', () => {
    expect(hashIdentifier('abc123')).toBe(hashIdentifier('abc123'))
  })

  it('is NOT equal to the raw input (plaintext never returned)', () => {
    const raw = 'super-secret-token-value'
    const hashed = hashIdentifier(raw)
    expect(hashed).not.toBe(raw)
    expect(hashed).not.toContain(raw)
  })

  it('differs for different inputs', () => {
    expect(hashIdentifier('a@b.com')).not.toBe(hashIdentifier('b@c.com'))
  })
})

describe('limit()', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('composes the identifier as ip|hashedId and passes preset through', async () => {
    const fake = makeFakeStore({ allowed: true, remaining: 4, retryAfterMs: 0 })
    vi.doMock('@/lib/rate-limit/config', () => ({
      getRateLimitStore: () => fake,
      RL: {
        login: { bucket: 'auth:login', windowMs: 15 * 60_000, max: 10 },
      },
    }))
    const { limit: limitFn } = await import('@/lib/rate-limit')

    const opts: LimitOptions = {
      preset: { bucket: 'auth:login', windowMs: 15 * 60_000, max: 10 },
      ip: '203.0.113.4',
      id: 'user@example.com',
    }
    const out = await limitFn(opts)

    expect(out).toEqual({ allowed: true, remaining: 4, retryAfterSeconds: 0 })
    expect(fake.calls).toHaveLength(1)
    const [call] = fake.calls
    expect(call.bucket).toBe('auth:login')
    expect(call.windowMs).toBe(15 * 60_000)
    expect(call.max).toBe(10)
    // identifier shape: <ip>|<sha256 hex of id>
    expect(call.identifier).toContain('|')
    const [ipPart, hashPart] = call.identifier.split('|')
    expect(ipPart).toBe('203.0.113.4')
    expect(hashPart).toMatch(/^[0-9a-f]{64}$/)
    expect(hashPart).not.toBe('user@example.com')
  })

  it('uses a literal "-" placeholder when no id is supplied', async () => {
    const fake = makeFakeStore({ allowed: true, remaining: 9, retryAfterMs: 0 })
    vi.doMock('@/lib/rate-limit/config', () => ({ getRateLimitStore: () => fake, RL: {} }))
    const { limit: limitFn } = await import('@/lib/rate-limit')

    await limitFn({
      preset: { bucket: 'public:pay', windowMs: 60_000, max: 12 },
      ip: '198.51.100.2',
    })

    expect(fake.calls[0]!.identifier).toBe('198.51.100.2|-')
  })

  it('rounds retryAfterMs UP to whole seconds (ceil)', async () => {
    // 2500 ms → ceil → 3 seconds
    const fake = makeFakeStore({ allowed: false, remaining: 0, retryAfterMs: 2500 })
    vi.doMock('@/lib/rate-limit/config', () => ({ getRateLimitStore: () => fake, RL: {} }))
    const { limit: limitFn } = await import('@/lib/rate-limit')

    const out = await limitFn({
      preset: { bucket: 'auth:login', windowMs: 15 * 60_000, max: 10 },
      ip: '1.2.3.4',
      id: 'x@y.com',
    })
    expect(out.allowed).toBe(false)
    expect(out.retryAfterSeconds).toBe(3)
    expect(out.remaining).toBe(0)
  })

  it('returns 0 seconds when retryAfterMs is 0', async () => {
    const fake = makeFakeStore({ allowed: true, remaining: 0, retryAfterMs: 0 })
    vi.doMock('@/lib/rate-limit/config', () => ({ getRateLimitStore: () => fake, RL: {} }))
    const { limit: limitFn } = await import('@/lib/rate-limit')

    const out = await limitFn({
      preset: { bucket: 'auth:login', windowMs: 60_000, max: 5 },
      ip: '1.2.3.4',
    })
    expect(out.retryAfterSeconds).toBe(0)
  })
})
