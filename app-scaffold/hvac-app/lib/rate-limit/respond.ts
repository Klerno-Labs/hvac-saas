import type { LimitResult } from './index'

export class RateLimitError extends Error {
  readonly retryAfterSeconds: number

  constructor(retryAfterSeconds: number) {
    super('Rate limit exceeded')
    this.name = 'RateLimitError'
    this.retryAfterSeconds = retryAfterSeconds
  }
}

export function tooManyRequests(retryAfterSeconds: number): Response {
  return new Response(JSON.stringify({ error: 'rate_limited', retryAfterSeconds }), {
    status: 429,
    headers: { 'content-type': 'application/json', 'Retry-After': String(retryAfterSeconds) },
  })
}

export function assertRateLimit(result: LimitResult): void {
  if (!result.allowed) throw new RateLimitError(result.retryAfterSeconds)
}
