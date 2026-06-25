import { db } from '@/lib/db'

export interface SlidingWindowStore {
  hit(
    bucket: string,
    identifier: string,
    windowMs: number,
    max: number,
  ): Promise<{ allowed: boolean; remaining: number; retryAfterMs: number }>
}

export interface RateLimitHitRow {
  id: string
  bucket: string
  identifier: string
  hitAt: Date
}

export interface RateLimitHitDelegate {
  count(args: {
    where: { bucket: string; identifier: string; hitAt: { gt: Date } }
  }): Promise<number>
  findFirst(args: {
    where: { bucket: string; identifier: string; hitAt: { gt: Date } }
    orderBy: { hitAt: 'asc' | 'desc' }
  }): Promise<RateLimitHitRow | null>
  create(args: {
    data: { bucket: string; identifier: string; hitAt: Date }
  }): Promise<RateLimitHitRow>
  deleteMany(args: {
    where: { hitAt: { lt: Date } }
  }): Promise<{ count: number }>
}

export type Clock = () => Date

export interface PrismaSlidingWindowStoreOptions {
  rateLimitHit?: RateLimitHitDelegate
  now?: Clock
}

export class PrismaSlidingWindowStore implements SlidingWindowStore {
  private readonly rateLimitHit: RateLimitHitDelegate
  private readonly now: Clock

  constructor(options: PrismaSlidingWindowStoreOptions = {}) {
    this.rateLimitHit = options.rateLimitHit ?? db.rateLimitHit
    this.now = options.now ?? (() => new Date())
  }

  async hit(
    bucket: string,
    identifier: string,
    windowMs: number,
    max: number,
  ): Promise<{ allowed: boolean; remaining: number; retryAfterMs: number }> {
    const now = this.now()
    const windowStart = new Date(now.getTime() - windowMs)
    const inWindow = {
      bucket,
      identifier,
      hitAt: { gt: windowStart },
    }

    const count = await this.rateLimitHit.count({ where: inWindow })

    if (count >= max) {
      const oldest = await this.rateLimitHit.findFirst({
        where: inWindow,
        orderBy: { hitAt: 'asc' },
      })
      const retryAfterMs = oldest
        ? Math.max(0, oldest.hitAt.getTime() + windowMs - now.getTime())
        : 0
      return { allowed: false, remaining: 0, retryAfterMs }
    }

    await this.rateLimitHit.create({
      data: { bucket, identifier, hitAt: now },
    })

    return {
      allowed: true,
      remaining: Math.max(0, max - count - 1),
      retryAfterMs: 0,
    }
  }
}

export async function pruneRateLimitHits(
  olderThanMs: number,
  rateLimitHit: RateLimitHitDelegate = db.rateLimitHit,
  now: Clock = () => new Date(),
): Promise<number> {
  const cutoff = new Date(now().getTime() - olderThanMs)
  const result = await rateLimitHit.deleteMany({
    where: { hitAt: { lt: cutoff } },
  })
  return result.count
}
