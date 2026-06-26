import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('next/headers', () => ({
  headers: vi.fn().mockResolvedValue({
    get: (_name: string) => null,
  }),
}))

vi.mock('@/lib/auth', () => ({
  handlers: {
    GET: vi.fn(),
    POST: vi.fn().mockResolvedValue(new Response('{"ok":true}', { status: 200 })),
  },
}))

// Prevent Prisma from connecting during import
vi.mock('@/lib/db', () => ({ db: {} }))
vi.mock('@/lib/events', () => ({ trackEvent: vi.fn() }))
vi.mock('@/lib/stripe', () => ({ getStripe: vi.fn() }))
vi.mock('@/lib/portal', () => ({ validatePortalToken: vi.fn() }))
vi.mock('@/lib/email', () => ({ sendPasswordResetEmail: vi.fn() }))

import { setRateLimitStore } from '@/lib/rate-limit'
import { assertRateLimit, RateLimitError } from '@/lib/rate-limit/respond'
import { POST as loginPost } from '@/app/api/auth/[...nextauth]/route'
import { createPortalCheckoutSession } from '@/app/portal/[token]/invoices/[invoiceId]/payment-action'

const allowedStore = {
  increment: vi.fn().mockResolvedValue({ count: 1, ttlMs: 60_000 }),
}
const deniedStore = {
  increment: vi.fn().mockResolvedValue({ count: 9_999, ttlMs: 60_000 }),
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('login route rate limiting', () => {
  it('passes through to NextAuth when under the limit', async () => {
    setRateLimitStore(allowedStore)
    const req = new Request('http://localhost/api/auth/callback/credentials', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'user@example.com', password: 'secret' }),
    })
    const res = await loginPost(req)
    expect(res.status).toBe(200)
  })

  it('returns 429 with numeric Retry-After header when over the limit', async () => {
    setRateLimitStore(deniedStore)
    const req = new Request('http://localhost/api/auth/callback/credentials', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'attacker@example.com', password: 'wrong' }),
    })
    const res = await loginPost(req)
    expect(res.status).toBe(429)
    const retryAfter = Number(res.headers.get('Retry-After'))
    expect(Number.isFinite(retryAfter) && retryAfter > 0).toBe(true)
    const body = (await res.json()) as { error: string; retryAfterSeconds: number }
    expect(body.error).toBe('rate_limited')
    expect(typeof body.retryAfterSeconds).toBe('number')
  })

  it('does not rate-limit non-credentials NextAuth endpoints', async () => {
    // store would deny if reached, but limit() should not be called for other endpoints
    setRateLimitStore(deniedStore)
    const req = new Request('http://localhost/api/auth/session', {
      method: 'POST',
    })
    const res = await loginPost(req)
    // NextAuth mock returns 200; the rate-limit guard must not have fired
    expect(res.status).toBe(200)
  })
})

describe('public-pay server action rate limiting', () => {
  it('returns rate-limit error when over the limit', async () => {
    setRateLimitStore(deniedStore)
    const result = await createPortalCheckoutSession('portal-token-abc', 'invoice-123')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toMatch(/too many attempts/i)
      expect(result.error).toMatch(/seconds/i)
    }
  })

  it('proceeds past rate limit check when under the limit', async () => {
    setRateLimitStore(allowedStore)
    // validatePortalToken returns null → action returns its own error (not a rate-limit error)
    const result = await createPortalCheckoutSession('portal-token-abc', 'invoice-123')
    expect(result.success).toBe(false)
    if (!result.success) {
      // should be portal/auth error, not rate-limit error
      expect(result.error).not.toMatch(/too many attempts/i)
    }
  })
})

describe('assertRateLimit', () => {
  it('does not throw when allowed', () => {
    expect(() => assertRateLimit({ allowed: true, retryAfterSeconds: 0 })).not.toThrow()
  })

  it('throws RateLimitError with retryAfterSeconds when denied', () => {
    try {
      assertRateLimit({ allowed: false, retryAfterSeconds: 42 })
      expect.unreachable('expected throw')
    } catch (e) {
      expect(e).toBeInstanceOf(RateLimitError)
      expect((e as RateLimitError).retryAfterSeconds).toBe(42)
    }
  })
})
