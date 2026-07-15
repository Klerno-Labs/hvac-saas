import { createHash } from 'crypto'
import type { RateLimitPreset } from './config'
import { getRateLimitStore } from './store'

export type { RateLimitPreset } from './config'
export { RL } from './config'
export type { RateLimitEntry, RateLimitStore } from './store'
export {
  getRateLimitStore,
  setRateLimitStore,
  resetRateLimitStore,
  MemoryRateLimitStore,
} from './store'

export type LimitInput = { preset: RateLimitPreset; ip?: string | null; id?: string | null }
export type LimitResult = { allowed: boolean; retryAfterSeconds: number }

function hashId(id: string): string {
  return createHash('sha256').update(id).digest('hex').slice(0, 32)
}

function buildKey(preset: RateLimitPreset, ip: string | null | undefined, id: string | null | undefined): string {
  const ns = `${preset.max}/${preset.windowSeconds}`
  if (id) return `${ns}:id:${hashId(id)}`
  if (ip) return `${ns}:ip:${ip}`
  return `${ns}:anon`
}

export async function limit({ preset, ip, id }: LimitInput): Promise<LimitResult> {
  const key = buildKey(preset, ip, id)
  const { count, resetsAt } = await getRateLimitStore().hit(key, preset.windowSeconds)
  if (count <= preset.max) return { allowed: true, retryAfterSeconds: 0 }
  const remainingMs = Math.max(0, resetsAt - Date.now())
  return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(remainingMs / 1000)) }
}

export function extractIp(headers: Headers): string | null {
  const xff = headers.get('x-forwarded-for')
  if (xff) {
    const first = xff.split(',')[0].trim()
    if (first) return first
  }
  return headers.get('x-real-ip') || null
}

export function getClientIp(req: Request): string | null {
  return extractIp(req.headers)
}
