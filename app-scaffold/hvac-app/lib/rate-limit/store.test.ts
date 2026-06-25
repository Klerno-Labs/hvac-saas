import { describe, it, expect, beforeEach } from 'vitest'
import { PrismaSlidingWindowStore } from '@/lib/rate-limit/store'

type Row = { bucket: string; identifier: string; hitAt: Date }

function makeFake(rows: Row[]) {
  return {
    rateLimitHit: {
      async findMany({
        where,
      }: {
        where: { bucket: string; identifier: string; hitAt: { gt: Date } }
        orderBy: { hitAt: 'asc' }
      }) {
        return rows
          .filter(
            (r) =>
              r.bucket === where.bucket &&
              r.identifier === where.identifier &&
              r.hitAt > where.hitAt.gt,
          )
          .sort((a, b) => a.hitAt.getTime() - b.hitAt.getTime())
      },
      async create({ data }: { data: { bucket: string; identifier: string } }) {
        rows.push({ bucket: data.bucket, identifier: data.identifier, hitAt: new Date() })
        return {}
      },
      async deleteMany({ where }: { where: { hitAt: { lt: Date } } }) {
        for (let i = rows.length - 1; i >= 0; i--) {
          if (rows[i].hitAt < where.hitAt.lt) rows.splice(i, 1)
        }
        return {}
      },
    },
  }
}

describe('PrismaSlidingWindowStore', () => {
  const BUCKET = 'test:bucket'
  const ID = '127.0.0.1|-'
  const WINDOW = 60_000
  const MAX = 3

  let rows: Row[]
  let store: PrismaSlidingWindowStore

  beforeEach(() => {
    rows = []
    store = new PrismaSlidingWindowStore(makeFake(rows))
  })

  it('(a) first max hits are allowed and remaining decrements', async () => {
    for (let i = 0; i < MAX; i++) {
      const result = await store.hit(BUCKET, ID, WINDOW, MAX)
      expect(result.allowed).toBe(true)
      expect(result.remaining).toBe(MAX - i - 1)
      expect(result.retryAfterMs).toBe(0)
    }
  })

  it('(b) the (max+1)th hit is denied with positive retryAfterMs', async () => {
    for (let i = 0; i < MAX; i++) {
      await store.hit(BUCKET, ID, WINDOW, MAX)
    }
    const denied = await store.hit(BUCKET, ID, WINDOW, MAX)
    expect(denied.allowed).toBe(false)
    expect(denied.remaining).toBe(0)
    expect(denied.retryAfterMs).toBeGreaterThan(0)
  })

  it('(c) hits outside the window are not counted', async () => {
    // Pre-populate with MAX hits that are older than the window
    const old = new Date(Date.now() - WINDOW - 1_000)
    for (let i = 0; i < MAX; i++) {
      rows.push({ bucket: BUCKET, identifier: ID, hitAt: old })
    }

    // A fresh hit should be allowed because the old hits are outside the window
    const result = await store.hit(BUCKET, ID, WINDOW, MAX)
    expect(result.allowed).toBe(true)
    expect(result.remaining).toBe(MAX - 1)
  })
})
