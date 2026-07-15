import { createHash } from 'crypto'
import { getRateLimitStore } from './config'

// Deploy assumption: app sits behind a trusted proxy (Vercel / Nginx).
// The first entry of x-forwarded-for is the real client IP in that setup.
export function getClientIp(req: Request | Headers): string {
  const h = req instanceof Headers ? req : req.headers
  const xff = h.get('x-forwarded-for')
  if (xff) {
    const first = xff.split(',')[0].trim()
    if (first) return first
  }
  return h.get('x-real-ip')?.trim() ?? '0.0.0.0'
}

// SHA-256 hex so emails/tokens are never stored or logged in plaintext.
export function hashIdentifier(raw: string): string {
  return createHash('sha256').update(raw).digest('hex')
}

export async function limit(opts: {
  preset: { bucket: string; windowMs: number; max: number }
  ip: string
  id?: string
}): Promise<{ allowed: boolean; retryAfterSeconds: number; remaining: number }> {
  const { preset, ip, id } = opts
  const identifier = `${ip}|${id ? hashIdentifier(id) : '-'}`
  const result = await getRateLimitStore().hit({
    bucket: preset.bucket,
    windowMs: preset.windowMs,
    max: preset.max,
    identifier,
  })
  return {
    allowed: result.allowed,
    remaining: result.remaining,
    retryAfterSeconds: Math.ceil(result.retryAfterMs / 1000),
  }
}
