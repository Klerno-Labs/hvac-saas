import { describe, it, expect } from 'vitest'
import { shouldSendCompletionNotice, isAuthorized } from '@/lib/job-complete-notice'

describe('shouldSendCompletionNotice', () => {
  it('returns true when transitioning to completed from a non-completed status', () => {
    expect(shouldSendCompletionNotice('scheduled', 'completed')).toBe(true)
    expect(shouldSendCompletionNotice('in_progress', 'completed')).toBe(true)
    expect(shouldSendCompletionNotice('booked', 'completed')).toBe(true)
    expect(shouldSendCompletionNotice('draft', 'completed')).toBe(true)
  })

  it('returns false for completed -> completed (idempotency: already complete)', () => {
    expect(shouldSendCompletionNotice('completed', 'completed')).toBe(false)
  })

  it('returns false when next status is not completed', () => {
    expect(shouldSendCompletionNotice('draft', 'scheduled')).toBe(false)
    expect(shouldSendCompletionNotice('scheduled', 'in_progress')).toBe(false)
    expect(shouldSendCompletionNotice('scheduled', 'scheduled')).toBe(false)
    expect(shouldSendCompletionNotice('in_progress', 'booked')).toBe(false)
  })
})

describe('isAuthorized', () => {
  it('returns true for matching Bearer token', () => {
    expect(isAuthorized('Bearer test-secret', 'test-secret')).toBe(true)
  })

  it('returns false for wrong token', () => {
    expect(isAuthorized('Bearer wrong-secret', 'test-secret')).toBe(false)
  })

  it('returns false when authorization header is missing', () => {
    expect(isAuthorized(null, 'test-secret')).toBe(false)
  })

  it('returns false for malformed header without Bearer prefix', () => {
    expect(isAuthorized('test-secret', 'test-secret')).toBe(false)
  })
})
