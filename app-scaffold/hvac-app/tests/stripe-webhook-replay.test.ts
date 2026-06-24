import { describe, it, expect } from 'vitest'
import {
  computeBackoffMs,
  isExhausted,
  sanitizeError,
  MAX_ATTEMPTS,
  BACKOFF_BASE_MS,
  BACKOFF_CAP_MS,
} from '@/lib/stripe-webhook-replay'

describe('computeBackoffMs', () => {
  it('uses BASE * 2^(attempt-1) progression', () => {
    expect(computeBackoffMs(1)).toBe(BACKOFF_BASE_MS) // 30s
    expect(computeBackoffMs(2)).toBe(60_000) // 1m
    expect(computeBackoffMs(3)).toBe(120_000) // 2m
    expect(computeBackoffMs(4)).toBe(240_000) // 4m
    expect(computeBackoffMs(5)).toBe(480_000) // 8m
    expect(computeBackoffMs(6)).toBe(960_000) // 16m
  })

  it('caps at BACKOFF_CAP_MS once the exponential would exceed it', () => {
    // attempt 8 would be 30s * 2^7 = 3,840,000ms > 3,600,000ms cap
    expect(computeBackoffMs(8)).toBe(BACKOFF_CAP_MS)
    expect(computeBackoffMs(50)).toBe(BACKOFF_CAP_MS)
  })

  it('never returns a value below BASE for non-positive attempts', () => {
    expect(computeBackoffMs(0)).toBe(BACKOFF_BASE_MS)
    expect(computeBackoffMs(-3)).toBe(BACKOFF_BASE_MS)
  })
})

describe('isExhausted', () => {
  it('is false while attempts remain within the budget', () => {
    for (let a = 1; a < MAX_ATTEMPTS; a++) {
      expect(isExhausted(a)).toBe(false)
    }
  })

  it('is true once attempts reach MAX_ATTEMPTS and beyond', () => {
    expect(isExhausted(MAX_ATTEMPTS)).toBe(true)
    expect(isExhausted(MAX_ATTEMPTS + 1)).toBe(true)
  })

  it('matches the documented "1 initial + (MAX-1) retries" semantics', () => {
    // MAX_ATTEMPTS=6 means the 6th failed dispatch dead-letters; i.e. the
    // first dispatch plus 5 retries.
    expect(MAX_ATTEMPTS).toBe(6)
    expect(isExhausted(MAX_ATTEMPTS - 1)).toBe(false)
  })
})

describe('sanitizeError', () => {
  it('redacts live Stripe secret keys', () => {
    const msg = `request failed: sk_live_${'a'.repeat(24)} used`
    const out = sanitizeError(msg)
    expect(out).toContain('[REDACTED]')
    expect(out).not.toContain('sk_live_')
    expect(out).not.toContain('a'.repeat(24))
  })

  it('redacts test Stripe secret keys and webhook signing secrets', () => {
    const out = sanitizeError(
      `bad sk_test_${'b'.repeat(20)} and whsec_${'c'.repeat(20)} leaked`,
    )
    expect(out).not.toContain('sk_test_')
    expect(out).not.toContain('whsec_')
  })

  it('redacts key=value style secret leakage', () => {
    const out = sanitizeError('stripe error password=hunter2 token=abc123 done')
    expect(out).not.toContain('hunter2')
    expect(out).not.toContain('abc123')
    expect(out).toContain('[REDACTED]')
  })

  it('leaves ordinary error messages intact', () => {
    const msg = 'Record to update not found. invoiceId=clx123'
    expect(sanitizeError(msg)).toBe(msg)
  })

  it('truncates very long messages', () => {
    const msg = 'x'.repeat(5000)
    const out = sanitizeError(msg)
    expect(out.length).toBeLessThan(msg.length)
    expect(out).toContain('[truncated]')
  })

  it('handles multiple occurrences of the same secret pattern', () => {
    const key = `sk_live_${'z'.repeat(20)}`
    const out = sanitizeError(`${key} ${key}`)
    expect(out.match(/sk_live_/g)).toBeNull()
    expect(out.match(/\[REDACTED\]/g)!.length).toBe(2)
  })
})
