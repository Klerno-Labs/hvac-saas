/**
 * Rate-limit backend selection + bucket presets.
 *
 * This is the ONLY place that decides Prisma-vs-Redis. Credentials are read
 * from env and never logged. The module stays pre-auth / org-agnostic: no
 * session or organization context is required or consulted here.
 */

import type { SlidingWindowStore } from './store'
import { PrismaSlidingWindowStore } from './store'
import { RedisSlidingWindowStore } from './redis-store'

export type RateLimitPreset = {
  /** Logical scope name, namespaced by surface (auth:, portal:, public:). */
  bucket: string
  /** Window length in milliseconds. */
  windowMs: number
  /** Maximum hits permitted within the window. */
  max: number
}

/**
 * The four rate-limited scopes in scope for this epic. Defaults are
 * intentionally conservative; tune via code change, not env.
 */
export const RL = {
  login: { bucket: 'auth:login', windowMs: 15 * 60_000, max: 10 },
  passwordReset: { bucket: 'auth:password-reset', windowMs: 60 * 60_000, max: 5 },
  portalToken: { bucket: 'portal:token', windowMs: 15 * 60_000, max: 20 },
  publicPay: { bucket: 'public:pay', windowMs: 60_000, max: 12 },
} as const satisfies Record<string, RateLimitPreset>

export type RateLimitPresetKey = keyof typeof RL

function upstashConfigured(): boolean {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN,
  )
}

let _store: SlidingWindowStore | null = null

/**
 * Return the process-wide rate-limit store, memoized on first call.
 * Prefers Upstash Redis when both REST env vars are set, else falls back to
 * the Prisma-backed store. The decision is made once and cached.
 *
 * Exposed for tests via `__resetRateLimitStoreCache()`.
 */
export function getRateLimitStore(): SlidingWindowStore {
  if (_store) return _store

  if (upstashConfigured()) {
    _store = new RedisSlidingWindowStore({
      url: process.env.UPSTASH_REDIS_REST_URL as string,
      token: process.env.UPSTASH_REDIS_REST_TOKEN as string,
    })
  } else {
    _store = new PrismaSlidingWindowStore()
  }
  return _store
}

/** Test-only: clear the memoized store so env changes take effect. */
export function __resetRateLimitStoreCache(): void {
  _store = null
}
