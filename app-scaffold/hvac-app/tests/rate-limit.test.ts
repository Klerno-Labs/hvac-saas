import { describe, it, expect, beforeEach } from 'vitest'
import {
  limit,
  getClientIp,
  setRateLimitStore,
  resetRateLimitStore,
  type RateLimitStore,
} from '@/lib/rate-limit'
import { tooManyRequests, assertRateLimit, RateLimitError } from '@/lib/rate-limit/respond'

function fakeStore(): RateLimitStore & { keys: () => string[] } {
  const counts = new Map<string, number>()
  return {
    async hit(key: string) {
      const c = (counts.get(key) ?? 0) + 1
      counts.set(key, c)
      return { count: c, resetsAt: Date.now() + 60_000 }
    },
    keys: () => Array.from(counts.keys()),
  }
}

describe('limit() with injected fake store', () => {
  let store: ReturnType<typeof fakeStore>

  beforeEach(() => {
    store = fakeStore()
    setRateLimitStore(store)
  })

  it('allows up to max requests then denies the next with a positive retry', async () => {
    const preset = { max: 3, windowSeconds: 60 }

    const a1 = await limit({ preset, id: 'user@example.com' })
    const a2 = await limit({ preset, id: 'user@example.com' })
    const a3 = await limit({ preset, id: 'user@example.com' })
    const a4 = await limit({ preset, id: 'user@example.com' })

    expect(a1.allowed).toBe(true)
    expect(a2.allowed).toBe(true)
    expect(a3.allowed).toBe(true)
    expect(a4.allowed).toBe(false)
    expect(a4.retryAfterSeconds).toBeGreaterThan(0)
  })

  it('hashes the identifier so the raw email/token is never stored as the key', async () => {
    const preset = { max: 2, windowSeconds: 60 }
    await limit({ preset, id: 'secret-token-value-123' })

    const keys = store.keys()
    expect(keys).toHaveLength(1)
    expect(keys[0]).not.toContain('secret-token-value-123')
    expect(keys[0]).toContain('id:')
  })

  it('buckets by id independently of ip, and falls back to ip when id absent', async () => {
    const preset = { max: 1, windowSeconds: 60 }

    const byId = await limit({ preset, id: 'a@b.com', ip: '1.1.1.1' })
    const sameIdOtherIp = await limit({ preset, id: 'a@b.com', ip: '2.2.2.2' })

    expect(byId.allowed).toBe(true)
    expect(sameIdOtherIp.allowed).toBe(false)

    const ipOnly = await limit({ preset, ip: '9.9.9.9' })
    expect(ipOnly.allowed).toBe(true)
    expect(store.keys().some((k) => k.includes('ip:'))).toBe(true)
  })
})

describe('tooManyRequests response helper', () => {
  it('returns a 429 with a numeric Retry-After and a minimal body', async () => {
    const res = tooManyRequests(30)

    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBe('30')
    expect(res.headers.get('content-type')).toBe('application/json')

    const raw = await res.text()
    const body = JSON.parse(raw)
    expect(body).toEqual({ error: 'rate_limited', retryAfterSeconds: 30 })
    expect(raw).not.toMatch(/email|token|count|remaining|identifier/i)
  })
})

describe('assertRateLimit', () => {
  beforeEach(() => resetRateLimitStore())

  it('does nothing when allowed', () => {
    expect(() => assertRateLimit({ allowed: true, retryAfterSeconds: 0 })).not.toThrow()
  })

  it('throws RateLimitError carrying retryAfterSeconds when denied', () => {
    try {
      assertRateLimit({ allowed: false, retryAfterSeconds: 7 })
      throw new Error('expected assertRateLimit to throw')
    } catch (e) {
      expect(e).toBeInstanceOf(RateLimitError)
      expect((e as RateLimitError).retryAfterSeconds).toBe(7)
    }
  })
})

describe('getClientIp', () => {
  it('reads the first x-forwarded-for entry', () => {
    const req = new Request('https://example.com', {
      headers: { 'x-forwarded-for': '203.0.113.5, 70.41.0.1' },
    })
    expect(getClientIp(req)).toBe('203.0.113.5')
  })

  it('falls back to x-real-ip', () => {
    const req = new Request('https://example.com', { headers: { 'x-real-ip': '198.51.100.7' } })
    expect(getClientIp(req)).toBe('198.51.100.7')
  })

  it('returns null when no ip headers are present', () => {
    const req = new Request('https://example.com')
    expect(getClientIp(req)).toBeNull()
  })
})
