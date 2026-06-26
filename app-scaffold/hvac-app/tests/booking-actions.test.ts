import { describe, it, expect } from 'vitest'
import { buildJobNotes } from '@/lib/booking'
import { confirmBookingSchema } from '@/lib/validations/booking'

describe('buildJobNotes', () => {
  it('combines preferredWindow and notes', () => {
    expect(buildJobNotes('Morning (8am-12pm)', 'AC not cooling')).toBe(
      'Preferred window: Morning (8am-12pm)\n\nAC not cooling'
    )
  })

  it('omits notes section when null', () => {
    expect(buildJobNotes('Afternoon', null)).toBe('Preferred window: Afternoon')
  })

  it('omits notes section when undefined', () => {
    expect(buildJobNotes('Evening')).toBe('Preferred window: Evening')
  })

  it('omits notes section for empty string', () => {
    expect(buildJobNotes('Anytime', '')).toBe('Preferred window: Anytime')
  })
})

describe('confirmBookingSchema', () => {
  it('defaults leadSource to web when omitted', () => {
    const result = confirmBookingSchema.safeParse({})
    expect(result.success).toBe(true)
    expect(result.data?.leadSource).toBe('web')
  })

  it('defaults leadSource to web when undefined', () => {
    const result = confirmBookingSchema.safeParse({ leadSource: undefined })
    expect(result.success).toBe(true)
    expect(result.data?.leadSource).toBe('web')
  })

  it('accepts a custom leadSource', () => {
    const result = confirmBookingSchema.safeParse({ leadSource: 'referral' })
    expect(result.success).toBe(true)
    expect(result.data?.leadSource).toBe('referral')
  })

  it('rejects leadSource exceeding max length', () => {
    const result = confirmBookingSchema.safeParse({ leadSource: 'x'.repeat(101) })
    expect(result.success).toBe(false)
  })
})
