/**
 * Public rate-limit API for route handlers.
 *
 * Pre-auth / org-agnostic: callers pass an IP and an optional identifier
 * (email, portal token, etc.). Identifiers are SHA-256 hashed BEFORE they
 * reach the store or any log line, so PII is never persisted in plaintext.
 *
 * Deploy is assumed to be behind a trusted proxy that sets x-forwarded-for.
 */

import { createHash } from 'crypto'

import { getRateLimitStore } from './config'
import type { RateLimitPreset } from './config'

export type { RateLimitPreset } from './config'
export { RL } from './config'
export type { SlidingWindowStore, RateLimitDecision } from './store'

export type LimitOutcome = {
  allowed: boolean
  /** Whole seconds the client should wait before retrying (ceil, ≥0). */
  retryAfterSeconds: number
  /** Remaining hits in the current window (0 when denied). */
  remaining: number
}

export type LimitOptions = {
  preset: RateLimitPreset
  /** Client IP from the request. */
  ip: string
  /** Optional per-user identifier (email, token, …). Hashed before storage. */
  id?: string
}

/**
 * Resolve the client IP from request headers.
 *
 * Reads `x-forwarded-for` (first hop) then `x-real-ip`; falls back to
 * `'0.0.0.0'`. This deploy is behind a trusted proxy that overwrites these
 * headers — do not use this for any security decision other than rate limiting.
 */
export function getClientIp(req: Request | Headers): string {
  const headers = req instanceof Headers ? req : req.headers
  const xff = headers.get('x-forwarded-for')
  if (xff) {
    const first = xff.split(',')[0]?.trim()
    if (first) return first
  }
  const xreal = headers.get('x-real-ip')
  if (xreal) return xreal.trim()
  return '0.0.0.0'
}

/**
 * SHA-256 hex of an identifier so emails/tokens/IPs are never stored or logged
 * in plaintext. Deterministic across processes.
 */
export function hashIdentifier(raw: string): string {
  return createHash('sha256').update(raw, 'utf8').digest('hex')
}

/**
 * The single decision function route handlers call.
 *
 * Builds identifier = `${ip}|${hashedId|'-'}`, records a hit against the
 * configured backend, and returns a client-safe outcome. Never throws PII into
 * logs: only the bucket and the hashed identifier ever leave this function.
 */
export async function limit(opts: LimitOptions): Promise<LimitOutcome> {
  const { preset, ip, id } = opts
  const identifier = `${ip}|${id ? hashIdentifier(id) : '-'}`
  const decision = await getRateLimitStore().hit({
    bucket: preset.bucket,
    identifier,
    windowMs: preset.windowMs,
    max: preset.max,
  })
  return {
    allowed: decision.allowed,
    remaining: decision.remaining,
    retryAfterSeconds: Math.ceil(decision.retryAfterMs / 1000),
  }
}
