/**
 * Sliding-window rate-limit store contract + Prisma fallback implementation.
 *
 * Pre-auth / org-agnostic by design: callers MUST pass identifiers that are
 * already hashed (see `hashIdentifier` in ./index.ts). This store never reads
 * organization/session context and never logs raw identifiers.
 */

import { db } from '@/lib/db'

export type RateLimitDecision = {
  allowed: boolean
  remaining: number
  /** Milliseconds until the oldest in-window entry expires (0 when allowed). */
  retryAfterMs: number
}

export type SlidingWindowStore = {
  /**
   * Record a hit against `(bucket, identifier)` and return the decision.
   * `windowMs` and `max` are scoped per call so one store can serve many buckets.
   */
  hit(opts: {
    bucket: string
    identifier: string
    windowMs: number
    max: number
  }): Promise<RateLimitDecision>
}

/**
 * Prisma-backed sliding window. Each row is one hit; entries older than the
 * window are pruned on every call so the table stays bounded.
 */
export class PrismaSlidingWindowStore implements SlidingWindowStore {
  async hit({
    bucket,
    identifier,
    windowMs,
    max,
  }: {
    bucket: string
    identifier: string
    windowMs: number
    max: number
  }): Promise<RateLimitDecision> {
    const now = Date.now()
    const windowStart = now - windowMs

    await db.rateLimitEntry.deleteMany({
      where: { bucket, identifier, timestamp: { lt: BigInt(windowStart) } },
    })

    const count = await db.rateLimitEntry.count({
      where: { bucket, identifier },
    })

    if (count < max) {
      await db.rateLimitEntry.create({
        data: { bucket, identifier, timestamp: BigInt(now) },
      })
      return { allowed: true, remaining: max - count - 1, retryAfterMs: 0 }
    }

    // Window full: find oldest in-window entry to compute retry-after.
    const oldest = await db.rateLimitEntry.findFirst({
      where: { bucket, identifier, timestamp: { gte: BigInt(windowStart) } },
      orderBy: { timestamp: 'asc' },
      select: { timestamp: true },
    })

    const oldestMs = oldest ? Number(oldest.timestamp) : now
    const retryAfterMs = Math.max(0, oldestMs + windowMs - now)
    return { allowed: false, remaining: 0, retryAfterMs }
  }
}
