import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getClientIp, hashIdentifier, limit } from './index'
import type { SlidingWindowStore } from './store'

vi.mock('./config', () => ({
  getRateLimitStore: vi.fn(),
  RL: {
    login: { bucket: 'auth:login', windowMs: 900_000, max: 10 },
  },
}))

import { getRateLimitStore } from './config'

describe('getClientIp', () => {
  it('returns first hop from x-forwarded-for', () => {
    expect(getClientIp(new Headers({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8' }))).toBe('1.2.3.4')
  })

  it('falls back to x-real-ip when x-forwarded-for is absent', () => {
    expect(getClientIp(new Headers({ 'x-real-ip': '9.9.9.9' }))).toBe('9.9.9.9')
  })

  it('falls back to 0.0.0.0 when no IP headers are present', () => {
    expect(getClientIp(new Headers())).toBe('0.0.0.0')
  })

  it('accepts a Request object', () => {
    const req = new Request('http://localhost', {
      headers: { 'x-forwarded-for': '10.0.0.1' },
    })
    expect(getClientIp(req)).toBe('10.0.0.1')
  })
})

describe('hashIdentifier', () => {
  it('is deterministic', () => {
    expect(hashIdentifier('user@example.com')).toBe(hashIdentifier('user@example.com'))
  })

  it('returns a 64-character hex string', () => {
    expect(hashIdentifier('test')).toMatch(/^[0-9a-f]{64}$/)
  })

  it('is not the raw input', () => {
    const raw = 'user@example.com'
    expect(hashIdentifier(raw)).not.toBe(raw)
  })
})

describe('limit', () => {
  const fakeHit = vi.fn()
  const fakeStore: SlidingWindowStore = { hit: fakeHit }

  beforeEach(() => {
    fakeHit.mockReset()
    vi.mocked(getRateLimitStore).mockReturnValue(fakeStore)
  })

  it('returns allowed=true with retryAfterSeconds=0', async () => {
    fakeHit.mockResolvedValue({ allowed: true, remaining: 5, retryAfterMs: 0 })
    const result = await limit({
      preset: { bucket: 'auth:login', windowMs: 900_000, max: 10 },
      ip: '1.2.3.4',
    })
    expect(result).toEqual({ allowed: true, remaining: 5, retryAfterSeconds: 0 })
  })

  it('ceil-rounds retryAfterMs to whole seconds', async () => {
    fakeHit.mockResolvedValue({ allowed: false, remaining: 0, retryAfterMs: 1001 })
    const result = await limit({
      preset: { bucket: 'auth:login', windowMs: 900_000, max: 10 },
      ip: '1.2.3.4',
    })
    expect(result.retryAfterSeconds).toBe(2)
  })

  it('hashes the id so the raw value never reaches the store', async () => {
    fakeHit.mockResolvedValue({ allowed: true, remaining: 9, retryAfterMs: 0 })
    const email = 'user@example.com'
    await limit({
      preset: { bucket: 'auth:login', windowMs: 900_000, max: 10 },
      ip: '1.1.1.1',
      id: email,
    })
    const { identifier } = fakeHit.mock.calls[0][0] as { identifier: string }
    expect(identifier).not.toContain(email)
    expect(identifier).toMatch(/\|[0-9a-f]{64}$/)
  })

  it('uses a dash segment when no id is provided', async () => {
    fakeHit.mockResolvedValue({ allowed: true, remaining: 9, retryAfterMs: 0 })
    await limit({
      preset: { bucket: 'auth:login', windowMs: 900_000, max: 10 },
      ip: '1.1.1.1',
    })
    const { identifier } = fakeHit.mock.calls[0][0] as { identifier: string }
    expect(identifier).toMatch(/\|-$/)
  })
})
