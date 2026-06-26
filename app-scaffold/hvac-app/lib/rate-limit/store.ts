import { db } from '@/lib/db'

export interface RateLimitStore {
  hit(key: string, windowMs: number): Promise<number>
}

class DbStore implements RateLimitStore {
  async hit(key: string, windowMs: number): Promise<number> {
    const cutoff = new Date(Date.now() - windowMs)
    await db.rateLimitHit.create({ data: { key } })
    return db.rateLimitHit.count({ where: { key, hitAt: { gte: cutoff } } })
  }
}

class UpstashStore implements RateLimitStore {
  private readonly url: string
  private readonly token: string

  constructor(url: string, token: string) {
    this.url = url
    this.token = token
  }

  async hit(key: string, windowMs: number): Promise<number> {
    // Fixed-window key: changes each windowMs period so the bucket never extends on activity
    const windowKey = `${key}:${Math.floor(Date.now() / windowMs)}`
    const res = await fetch(`${this.url}/pipeline`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([
        ['INCR', windowKey],
        ['PEXPIRE', windowKey, windowMs * 2],
      ]),
    })
    if (!res.ok) throw new Error(`Upstash pipeline error: ${res.status}`)
    const data = await res.json() as [{ result: number; error?: string }, unknown]
    if (data[0].error) throw new Error(`Upstash INCR error: ${data[0].error}`)
    return data[0].result
  }
}

export function getRateLimitStore(): RateLimitStore {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (url && token) return new UpstashStore(url, token)
  return new DbStore()
}

export async function pruneRateLimitHits(windowMs: number): Promise<{ deleted: number }> {
  const cutoff = new Date(Date.now() - windowMs)
  const result = await db.rateLimitHit.deleteMany({ where: { hitAt: { lt: cutoff } } })
  return { deleted: result.count }
}
