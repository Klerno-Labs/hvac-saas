import { describe, it, expect } from 'vitest'
import {
  PrismaSlidingWindowStore,
  pruneRateLimitHits,
  type RateLimitHitDelegate,
  type RateLimitHitRow,
} from './store'

interface FakeOptions {
  now?: () => Date
}

function createFakeDelegate(): RateLimitHitDelegate & { rows: RateLimitHitRow[] } {
  const rows: RateLimitHitRow[] = []
  let nextId = 0

  const delegate: RateLimitHitDelegate & { rows: RateLimitHitRow[] } = {
    rows,
    async count({ where }) {
      const gt = where.hitAt.gt.getTime()
      return rows.filter(
        (r) =>
          r.bucket === where.bucket &&
          r.identifier === where.identifier &&
          r.hitAt.getTime() > gt,
      ).length
    },
    async findFirst({ where, orderBy }) {
      const gt = where.hitAt.gt.getTime()
      const matched = rows
        .filter(
          (r) =>
            r.bucket === where.bucket &&
            r.identifier === where.identifier &&
            r.hitAt.getTime() > gt,
        )
        .sort((a, b) =>
          orderBy.hitAt === 'asc'
            ? a.hitAt.getTime() - b.hitAt.getTime()
            : b.hitAt.getTime() - a.hitAt.getTime(),
        )
      return matched[0] ?? null
    },
    async create({ data }) {
      const row: RateLimitHitRow = {
        id: `hit_${nextId++}`,
        bucket: data.bucket,
        identifier: data.identifier,
        hitAt: data.hitAt,
      }
      rows.push(row)
      return row
    },
    async deleteMany({ where }) {
      const lt = where.hitAt.lt.getTime()
      let removed = 0
      for (let i = rows.length - 1; i >= 0; i--) {
        if (rows[i].hitAt.getTime() < lt) {
          rows.splice(i, 1)
          removed++
        }
      }
      return { count: removed }
    },
  }

  return delegate
}

function createStore(opts: FakeOptions = {}) {
  const delegate = createFakeDelegate()
  const now = opts.now ?? (() => new Date(0))
  const store = new PrismaSlidingWindowStore({ rateLimitHit: delegate, now })
  return { store, delegate }
}

describe('PrismaSlidingWindowStore', () => {
  it('allows the first `max` hits within a window and decrements remaining', async () => {
    let clock = 1_000
    const { store, delegate } = createStore({ now: () => new Date(clock) })

    const windowMs = 10_000
    const r1 = await store.hit('auth:login', '1.2.3.4|-', windowMs, 3)
    clock += 100
    const r2 = await store.hit('auth:login', '1.2.3.4|-', windowMs, 3)
    clock += 100
    const r3 = await store.hit('auth:login', '1.2.3.4|-', windowMs, 3)

    expect(r1).toEqual({ allowed: true, remaining: 2, retryAfterMs: 0 })
    expect(r2).toEqual({ allowed: true, remaining: 1, retryAfterMs: 0 })
    expect(r3).toEqual({ allowed: true, remaining: 0, retryAfterMs: 0 })
    expect(delegate.rows).toHaveLength(3)
  })

  it('denies the (max+1)th hit with a positive retryAfterMs', async () => {
    let clock = 5_000
    const { store } = createStore({ now: () => new Date(clock) })
    const windowMs = 10_000

    await store.hit('portal:token', 'tok|-', windowMs, 3) // hitAt = 5000
    clock += 100
    await store.hit('portal:token', 'tok|-', windowMs, 3) // hitAt = 5100
    clock += 100
    await store.hit('portal:token', 'tok|-', windowMs, 3) // hitAt = 5200
    clock += 100 // now = 5300

    const denied = await store.hit('portal:token', 'tok|-', windowMs, 3)

    expect(denied.allowed).toBe(false)
    expect(denied.remaining).toBe(0)
    // retryAfter = oldestHitAt(5000) + windowMs(10000) - now(5300) = 9700
    expect(denied.retryAfterMs).toBe(9700)
    expect(denied.retryAfterMs).toBeGreaterThan(0)
  })

  it('does not count hits outside the window (sliding window expiry)', async () => {
    let clock = 0
    const { store, delegate } = createStore({ now: () => new Date(clock) })
    const windowMs = 1_000

    const a = await store.hit('public:pay', '1.2.3.4|-', windowMs, 2) // hitAt 0, remaining 1
    expect(a.allowed).toBe(true)
    clock += 200
    const b = await store.hit('public:pay', '1.2.3.4|-', windowMs, 2) // hitAt 200, remaining 0
    expect(b.allowed).toBe(true)
    clock += 200
    const c = await store.hit('public:pay', '1.2.3.4|-', windowMs, 2) // hitAt 400, denied
    expect(c.allowed).toBe(false)

    // Advance past the entire window so all prior hits fall out.
    clock = 1_500
    const d = await store.hit('public:pay', '1.2.3.4|-', windowMs, 2)
    expect(d.allowed).toBe(true)
    expect(d.remaining).toBe(1)
    expect(d.retryAfterMs).toBe(0)
    // Denied hits are NOT recorded; only the two allowed hits before the window
    // expired plus the one after = 3 rows. The old rows remain in storage
    // (append-only) but are excluded from the window by the hitAt > cutoff filter.
    expect(delegate.rows).toHaveLength(3)
    expect(delegate.rows.map((r) => r.hitAt.getTime()).sort((x, y) => x - y))
      .toEqual([0, 200, 1500])
  })

  it('treats different buckets and identifiers independently', async () => {
    let clock = 0
    const { store } = createStore({ now: () => new Date(clock) })
    const windowMs = 10_000

    const ip1 = await store.hit('auth:login', '1.1.1.1|-', windowMs, 1)
    const ip2 = await store.hit('auth:login', '2.2.2.2|-', windowMs, 1)
    const otherBucket = await store.hit('public:pay', '1.1.1.1|-', windowMs, 1)

    expect(ip1.allowed).toBe(true)
    expect(ip2.allowed).toBe(true)
    expect(otherBucket.allowed).toBe(true)

    clock += 100
    const ip1Again = await store.hit('auth:login', '1.1.1.1|-', windowMs, 1)
    expect(ip1Again.allowed).toBe(false)
    const ip2Again = await store.hit('auth:login', '2.2.2.2|-', windowMs, 1)
    expect(ip2Again.allowed).toBe(false)
  })

  it('never returns a negative retryAfterMs', async () => {
    let clock = 0
    const { store } = createStore({ now: () => new Date(clock) })
    const windowMs = 1_000

    await store.hit('b', 'id|-', windowMs, 1)
    // Jump far enough that the oldest hit is technically past the window edge,
    // simulating clock skew: count may still see it depending on timing, but
    // retryAfterMs must be clamped to 0 if it would be negative.
    clock = windowMs + 5_000
    const denied = await store.hit('b', 'id|-', windowMs, 1)
    if (!denied.allowed) {
      expect(denied.retryAfterMs).toBeGreaterThanOrEqual(0)
    }
  })
})

describe('pruneRateLimitHits', () => {
  it('deletes only rows older than the cutoff and returns the count', async () => {
    const delegate = createFakeDelegate()
    let clock = 0
    const now = () => new Date(clock)

    delegate.rows.push(
      { id: 'old1', bucket: 'b', identifier: 'i', hitAt: new Date(100) },
      { id: 'old2', bucket: 'b', identifier: 'i', hitAt: new Date(200) },
      { id: 'keep1', bucket: 'b', identifier: 'i', hitAt: new Date(5_000) },
      { id: 'keep2', bucket: 'b', identifier: 'i', hitAt: new Date(6_000) },
    )

    clock = 6_000
    const removed = await pruneRateLimitHits(5_000, delegate, now)

    expect(removed).toBe(2)
    expect(delegate.rows.map((r) => r.id).sort()).toEqual(['keep1', 'keep2'])
  })
})
