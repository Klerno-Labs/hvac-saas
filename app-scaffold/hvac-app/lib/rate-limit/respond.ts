import type { LimitResult } from './index'

export function tooManyRequests(retryAfterSeconds: number): Response {
  return new Response(
    JSON.stringify({ error: 'rate_limited', retryAfterSeconds }),
    {
      status: 429,
      headers: {
        'content-type': 'application/json',
        'Retry-After': String(retryAfterSeconds),
      },
    },
  )
}

export class RateLimitError extends Error {
  constructor(public readonly retryAfterSeconds: number) {
    super(`Rate limited. Try again in ${retryAfterSeconds} seconds.`)
    this.name = 'RateLimitError'
  }
}

export function assertRateLimit(result: LimitResult): void {
  if (!result.allowed) {
    throw new RateLimitError(result.retryAfterSeconds)
  }
}
