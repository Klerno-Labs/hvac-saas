import type { SlidingWindowStore } from './store'
import { PrismaSlidingWindowStore } from './store'
import { RedisSlidingWindowStore } from './redis-store'

export const RL = {
  login:         { bucket: 'auth:login',          windowMs: 15 * 60_000, max: 10 },
  passwordReset: { bucket: 'auth:password-reset', windowMs: 60 * 60_000, max: 5  },
  portalToken:   { bucket: 'portal:token',        windowMs: 15 * 60_000, max: 20 },
  publicPay:     { bucket: 'public:pay',          windowMs:      60_000, max: 12 },
} as const

let _store: SlidingWindowStore | undefined

export function getRateLimitStore(): SlidingWindowStore {
  if (_store) return _store
  const url   = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  _store = url && token
    ? new RedisSlidingWindowStore(url, token)
    : new PrismaSlidingWindowStore()
  return _store
}
