import { db } from '@/lib/db'

export interface SlidingWindowStore {
  hit(
    bucket: string,
    identifier: string,
    windowMs: number,
    max: number,
  ): Promise<{ allowed: boolean; remaining: number; retryAfterMs: number }>
}

// Minimal structural type for the Prisma delegate we need — keeps this file
// decoupled from the full PrismaClient so tests can inject a lightweight fake.
interface RateLimitDelegate {
  findMany(args: {
    where: { bucket: string; identifier: string; hitAt: { gt: Date } }
    orderBy: { hitAt: 'asc' }
  }): Promise<{ hitAt: Date }[]>
  create(args: { data: { bucket: string; identifier: string } }): Promise<unknown>
  deleteMany(args: { where: { hitAt: { lt: Date } } }): Promise<unknown>
}

interface RateLimitDb {
  rateLimitHit: RateLimitDelegate
}

export class PrismaSlidingWindowStore implements SlidingWindowStore {
  private readonly client: RateLimitDb

  constructor(client: RateLimitDb = db as unknown as RateLimitDb) {
    this.client = client
  }

  async hit(bucket: string, identifier: string, windowMs: number, max: number) {
    const cutoff = new Date(Date.now() - windowMs)

    const hits = await this.client.rateLimitHit.findMany({
      where: { bucket, identifier, hitAt: { gt: cutoff } },
      orderBy: { hitAt: 'asc' },
    })

    const count = hits.length

    if (count >= max) {
      const oldest = hits[0]!
      const retryAfterMs = Math.max(0, oldest.hitAt.getTime() + windowMs - Date.now())
      return { allowed: false, remaining: 0, retryAfterMs }
    }

    await this.client.rateLimitHit.create({ data: { bucket, identifier } })
    return { allowed: true, remaining: max - count - 1, retryAfterMs: 0 }
  }
}

export async function pruneRateLimitHits(olderThanMs: number): Promise<void> {
  const cutoff = new Date(Date.now() - olderThanMs)
  await db.rateLimitHit.deleteMany({ where: { hitAt: { lt: cutoff } } })
}
