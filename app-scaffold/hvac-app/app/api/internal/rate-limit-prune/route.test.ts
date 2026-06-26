import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockPrune = vi.hoisted(() => vi.fn())

vi.mock('@/lib/rate-limit/store', () => ({
  pruneRateLimitHits: mockPrune,
}))

import { POST } from '@/app/api/internal/rate-limit-prune/route'

describe('POST /api/internal/rate-limit-prune', () => {
  beforeEach(() => {
    mockPrune.mockReset()
    process.env.CRON_SECRET = 'test-cron-secret'
  })

  afterEach(() => {
    delete process.env.CRON_SECRET
  })

  it('returns 401 when x-cron-secret header is absent', async () => {
    const req = new Request('http://localhost/api/internal/rate-limit-prune', { method: 'POST' })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('returns 401 when x-cron-secret header is wrong', async () => {
    const req = new Request('http://localhost/api/internal/rate-limit-prune', {
      method: 'POST',
      headers: { 'x-cron-secret': 'wrong-secret' },
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('returns 401 when CRON_SECRET env is not set', async () => {
    delete process.env.CRON_SECRET
    const req = new Request('http://localhost/api/internal/rate-limit-prune', {
      method: 'POST',
      headers: { 'x-cron-secret': 'any-value' },
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('returns 200 with { deleted: N } on matching secret', async () => {
    mockPrune.mockResolvedValue({ deleted: 42 })
    const req = new Request('http://localhost/api/internal/rate-limit-prune', {
      method: 'POST',
      headers: { 'x-cron-secret': 'test-cron-secret' },
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ deleted: 42 })
  })
})
