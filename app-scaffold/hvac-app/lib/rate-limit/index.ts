import { getRateLimitStore } from './store'

export interface RateLimitResult {
  allowed: boolean
  retryAfterSeconds: number
  remaining: number
}

export interface RateLimitOptions {
  windowMs: number
  max: number
}

// Monotonically increments on each store failure; reset only in tests via resetStoreErrorCount().
let storeErrorCount = 0

export function getStoreErrorCount(): number {
  return storeErrorCount
}

export function resetStoreErrorCount(): void {
  storeErrorCount = 0
}

/**
 * Check and record a rate-limit hit for `key`.
 *
 * Fail-open: if the backing store is unavailable the function returns
 * `allowed: true` so a limiter outage can never block auth or payments.
 * A structured warning is emitted and `getStoreErrorCount()` increments so
 * repeated failures are observable in logs/alerting.
 *
 * Keys must not contain raw IPs, emails, or tokens — callers are responsible
 * for hashing or anonymising identifiers before passing them here.
 */
export async function limit(key: string, opts: RateLimitOptions): Promise<RateLimitResult> {
  try {
    const count = await getRateLimitStore().hit(key, opts.windowMs)
    const allowed = count <= opts.max
    const remaining = Math.max(0, opts.max - count)
    const retryAfterSeconds = allowed ? 0 : Math.ceil(opts.windowMs / 1000)
    return { allowed, retryAfterSeconds, remaining }
  } catch (err) {
    storeErrorCount++
    console.warn('[rate-limit] store error; degrading to allow', {
      errorCount: storeErrorCount,
      error: String(err),
    })
    return { allowed: true, retryAfterSeconds: 0, remaining: 0 }
  }
}
