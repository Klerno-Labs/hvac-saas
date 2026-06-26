import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockDeleteMany = vi.hoisted(() => vi.fn())

vi.mock('@/lib/db', () => ({
  db: {
    rateLimitHit: {
      deleteMany: mockDeleteMany,
    },
  },
}))

import { pruneRateLimitHits } from '@/lib/rate-limit/store'

describe('pruneRateLimitHits', () => {
  beforeEach(() => {
    mockDeleteMany.mockReset()
  })

  it('deletes rows older than the cutoff and returns the count', async () => {
    mockDeleteMany.mockResolvedValue({ count: 5 })

    const before = Date.now()
    const { deleted } = await pruneRateLimitHits(3_600_000)
    const after = Date.now()

    expect(deleted).toBe(5)
    expect(mockDeleteMany).toHaveBeenCalledOnce()

    const { where } = mockDeleteMany.mock.calls[0][0] as { where: { hitAt: { lt: Date } } }
    expect(where.hitAt.lt).toBeInstanceOf(Date)
    const cutoffMs = where.hitAt.lt.getTime()
    expect(cutoffMs).toBeGreaterThanOrEqual(before - 3_600_000)
    expect(cutoffMs).toBeLessThanOrEqual(after - 3_600_000)
  })

  it('targets only the lt predicate — leaves in-window rows untouched', async () => {
    mockDeleteMany.mockResolvedValue({ count: 0 })
    await pruneRateLimitHits(3_600_000)

    const { where } = mockDeleteMany.mock.calls[0][0] as { where: { hitAt: Record<string, unknown> } }
    expect(where.hitAt).toHaveProperty('lt')
    expect(where.hitAt).not.toHaveProperty('gte')
  })

  it('returns deleted:0 when nothing is expired', async () => {
    mockDeleteMany.mockResolvedValue({ count: 0 })
    const { deleted } = await pruneRateLimitHits(3_600_000)
    expect(deleted).toBe(0)
  })
})
