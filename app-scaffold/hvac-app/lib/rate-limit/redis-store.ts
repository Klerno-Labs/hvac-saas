/**
 * Upstash Redis REST implementation of SlidingWindowStore.
 *
 * Uses the sorted-set sliding-window pattern, one ZSET per (bucket+identifier):
 *   ZREMRANGEBYSCORE key -inf (windowStart   -- drop entries older than window
 *   ZCARD key                              -- count remaining
 *   if under max:
 *     ZADD key <now> <unique-member>       -- record this hit
 *   PEXPIRE key <windowMs>                 -- keep the key from leaking
 *   ZRANGE key 0 0 WITHSCORES              -- oldest score → retry-after
 *
 * No SDK dependency: talks to the Upstash REST API via `fetch`. Credentials
 * are injected at construction and never logged or returned to callers.
 */

import type { RateLimitDecision, SlidingWindowStore } from './store'

type UpstashSingleResponse = { result?: unknown; error?: string }
type UpstashPipelineResponse = Array<UpstashSingleResponse>

export class RedisSlidingWindowStore implements SlidingWindowStore {
  private readonly url: string
  private readonly token: string
  private readonly keyPrefix: string

  constructor(opts: {
    url: string
    token: string
    /** Key prefix so rate-limit ZSETs don't collide with other Upstash users. */
    keyPrefix?: string
  }) {
    this.url = opts.url.replace(/\/+$/, '')
    this.token = opts.token
    this.keyPrefix = opts.keyPrefix ?? 'rl:'
  }

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
    const key = `${this.keyPrefix}${bucket}:${identifier}`

    // Phase 1: prune + count.
    const [countRaw] = await this.exec<[number, number]>([
      ['ZREMRANGEBYSCORE', key, '-inf', `(${windowStart}`],
      ['ZCARD', key],
    ])
    const count = Number(countRaw ?? 0)

    if (count < max) {
      const member = `${now}:${Math.random().toString(36).slice(2, 10)}`
      const [, , oldestRaw] = await this.exec<[number, number, string[]]>([
        ['ZADD', key, String(now), member],
        ['PEXPIRE', key, String(windowMs)],
        ['ZRANGE', key, '0', '0', 'WITHSCORES'],
      ])
      // On the allow path we don't need oldest; remaining is what matters.
      void oldestRaw
      return { allowed: true, remaining: max - count - 1, retryAfterMs: 0 }
    }

    // Denied: compute retry-after from the oldest in-window entry.
    const [, oldestRaw] = await this.exec<[number, string[]]>([
      ['PEXPIRE', key, String(windowMs)],
      ['ZRANGE', key, '0', '0', 'WITHSCORES'],
    ])
    const oldestScore = parseOldestScore(oldestRaw)
    const retryAfterMs = oldestScore === null ? 0 : Math.max(0, oldestScore + windowMs - now)
    return { allowed: false, remaining: 0, retryAfterMs }
  }

  /**
   * Execute a pipeline of commands. Upstash REST returns an array of
   * `{result, error}` objects, one per command.
   */
  private async exec<T>(pipeline: string[][]): Promise<T> {
    if (!this.url || !this.token) {
      throw new Error('RedisSlidingWindowStore: missing Upstash URL or token')
    }
    const res = await fetch(this.url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(pipeline),
      cache: 'no-store',
    })
    if (!res.ok) {
      // Never include the token or URL in the thrown message.
      throw new Error(`RedisSlidingWindowStore: Upstash responded ${res.status}`)
    }
    const json = (await res.json()) as UpstashPipelineResponse
    return json.map((entry) => entry.result) as unknown as T
  }
}

function parseOldestScore(raw: unknown): number | null {
  // ZRANGE ... WITHSCORES returns a flat array: [member, score, ...].
  if (!Array.isArray(raw) || raw.length < 2) return null
  const score = Number(raw[1])
  return Number.isFinite(score) ? score : null
}
