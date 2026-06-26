import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const mockHit = vi.hoisted(() => vi.fn().mockRejectedValue(new Error('store unavailable')))

vi.mock('@/lib/rate-limit/store', () => ({
  getRateLimitStore: () => ({ hit: mockHit }),
}))

import { limit, getStoreErrorCount, resetStoreErrorCount } from '@/lib/rate-limit/index'

describe('limit() fail-open', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    resetStoreErrorCount()
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    warnSpy.mockRestore()
  })

  it('resolves to allowed:true when the store rejects (does not throw)', async () => {
    const result = await limit('test-key', { windowMs: 60_000, max: 5 })
    expect(result).toEqual({ allowed: true, retryAfterSeconds: 0, remaining: 0 })
  })

  it('emits exactly one console.warn per failed call', async () => {
    await limit('test-key', { windowMs: 60_000, max: 5 })
    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(warnSpy.mock.calls[0][0]).toBe('[rate-limit] store error; degrading to allow')
  })

  it('increments the error counter on each store failure', async () => {
    await limit('k', { windowMs: 60_000, max: 5 })
    expect(getStoreErrorCount()).toBe(1)
    await limit('k', { windowMs: 60_000, max: 5 })
    expect(getStoreErrorCount()).toBe(2)
  })
})
