import { createHash } from 'crypto'
import type { RateLimitPreset } from './config'

export interface RateLimitStore {
  increment(key: string, windowMs: number): Promise<{ count: number; ttlMs: number }>
}

export interface LimitResult {
  allowed: boolean
  retryAfterSeconds: number
}

const memoryStore = new Map<string, { count: number; resetAt: number }>()

const defaultStore: RateLimitStore = {
  async increment(key: string, windowMs: number) {
    const now = Date.now()
    const entry = memoryStore.get(key)
    if (!entry || entry.resetAt <= now) {
      memoryStore.set(key, { count: 1, resetAt: now + windowMs })
      return { count: 1, ttlMs: windowMs }
    }
    entry.count++
    return { count: entry.count, ttlMs: entry.resetAt - now }
  },
}

let activeStore: RateLimitStore = defaultStore

export function getRateLimitStore(): RateLimitStore {
  return activeStore
}

export function setRateLimitStore(store: RateLimitStore): void {
  activeStore = store
}

function hashKey(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 16)
}

export async function limit({
  preset,
  ip,
  id,
}: {
  preset: RateLimitPreset
  ip?: string
  id?: string
}): Promise<LimitResult> {
  const parts: string[] = []
  if (ip) parts.push(`ip:${hashKey(ip)}`)
  if (id) parts.push(`id:${hashKey(id)}`)
  const key = parts.join('|') || 'anon'

  const { count, ttlMs } = await activeStore.increment(key, preset.windowMs)

  if (count > preset.maxRequests) {
    return { allowed: false, retryAfterSeconds: Math.ceil(ttlMs / 1000) }
  }
  return { allowed: true, retryAfterSeconds: 0 }
}

export function getClientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  return req.headers.get('x-real-ip') ?? '127.0.0.1'
}
