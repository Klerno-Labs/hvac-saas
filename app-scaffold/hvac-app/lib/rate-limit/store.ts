export interface HitResult {
  allowed: boolean
  remaining: number
  retryAfterMs: number
}

export interface SlidingWindowStore {
  hit(opts: {
    bucket: string
    identifier: string
    windowMs: number
    max: number
  }): Promise<HitResult>
}

// In-process fallback — not safe for multi-instance production deployments.
// Set UPSTASH_* env vars to use RedisSlidingWindowStore instead.
export class PrismaSlidingWindowStore implements SlidingWindowStore {
  private readonly windows = new Map<string, number[]>()

  async hit({ bucket, identifier, windowMs, max }: {
    bucket: string
    identifier: string
    windowMs: number
    max: number
  }): Promise<HitResult> {
    const key = `${bucket}:${identifier}`
    const now = Date.now()
    const cutoff = now - windowMs
    const hits = (this.windows.get(key) ?? []).filter(ts => ts > cutoff)

    if (hits.length >= max) {
      const retryAfterMs = Math.max(0, hits[0] + windowMs - now)
      return { allowed: false, remaining: 0, retryAfterMs }
    }

    hits.push(now)
    this.windows.set(key, hits)
    return { allowed: true, remaining: max - hits.length, retryAfterMs: 0 }
  }
}
