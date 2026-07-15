import { describe, it, expect } from 'vitest'
import { shouldSendCompletionNotice } from '@/lib/job-complete-notice'

describe('shouldSendCompletionNotice', () => {
  it('returns true when transitioning from in_progress to completed', () => {
    expect(shouldSendCompletionNotice('in_progress', 'completed')).toBe(true)
  })

  it('returns true when transitioning from scheduled to completed', () => {
    expect(shouldSendCompletionNotice('scheduled', 'completed')).toBe(true)
  })

  it('returns true when transitioning from booked to completed', () => {
    expect(shouldSendCompletionNotice('booked', 'completed')).toBe(true)
  })

  it('returns true when transitioning from draft to completed', () => {
    expect(shouldSendCompletionNotice('draft', 'completed')).toBe(true)
  })

  it('returns false for completed -> completed (already done, no duplicate notice)', () => {
    expect(shouldSendCompletionNotice('completed', 'completed')).toBe(false)
  })

  it('returns false when next status is not completed', () => {
    expect(shouldSendCompletionNotice('in_progress', 'scheduled')).toBe(false)
  })

  it('returns false for non-terminal transitions', () => {
    expect(shouldSendCompletionNotice('draft', 'booked')).toBe(false)
    expect(shouldSendCompletionNotice('scheduled', 'in_progress')).toBe(false)
  })
})
