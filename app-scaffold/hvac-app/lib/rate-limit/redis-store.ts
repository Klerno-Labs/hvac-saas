import type { HitResult, SlidingWindowStore } from './store'

type PipelineResult = { result: unknown; error?: string }

export class RedisSlidingWindowStore implements SlidingWindowStore {
  constructor(
    private readonly url: string,
    private readonly token: string,
  ) {}

  private async pipeline(commands: string[][]): Promise<unknown[]> {
    const res = await fetch(`${this.url}/pipeline`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(commands),
    })
    if (!res.ok) throw new Error(`Upstash pipeline error: ${res.status}`)
    const data = (await res.json()) as PipelineResult[]
    return data.map(item => {
      if (item.error) throw new Error(`Redis command error: ${item.error}`)
      return item.result
    })
  }

  async hit({ bucket, identifier, windowMs, max }: {
    bucket: string
    identifier: string
    windowMs: number
    max: number
  }): Promise<HitResult> {
    const key = `${bucket}:${identifier}`
    const now = Date.now()
    const cutoff = now - windowMs

    // Prune expired, read oldest remaining, read current count — single round-trip.
    const [, oldestRaw, countRaw] = await this.pipeline([
      ['ZREMRANGEBYSCORE', key, '0', String(cutoff - 1)],
      ['ZRANGE', key, '0', '0', 'WITHSCORES'],
      ['ZCARD', key],
    ])

    const count = countRaw as number
    const oldest = oldestRaw as string[] // ["member","score"] or []

    if (count >= max) {
      const oldestScore = oldest.length >= 2 ? Number(oldest[1]) : cutoff
      const retryAfterMs = Math.max(0, oldestScore + windowMs - now)
      return { allowed: false, remaining: 0, retryAfterMs }
    }

    // Add new entry and refresh TTL — second round-trip only on the allowed path.
    const member = `${now}-${Math.random().toString(36).slice(2, 9)}`
    await this.pipeline([
      ['ZADD', key, String(now), member],
      ['PEXPIRE', key, String(windowMs)],
    ])

    return { allowed: true, remaining: max - count - 1, retryAfterMs: 0 }
  }
}
