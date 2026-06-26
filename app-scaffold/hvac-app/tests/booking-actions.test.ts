import { describe, it, expect, vi } from 'vitest'

// Mock heavy server-only dependencies so pure helpers can be imported in isolation.
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/db', () => ({ db: {} }))
vi.mock('@/lib/events', () => ({ trackEvent: vi.fn() }))
vi.mock('@/lib/booking', () => ({
  generateBookingSlug: vi.fn(),
  isValidBookingSlug: vi.fn(),
  resolveBookingOrg: vi.fn(),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { buildJobNotes } from '@/app/bookings/actions'
import { confirmBookingSchema } from '@/lib/validations/booking'

describe('buildJobNotes', () => {
  it('composes preferred window and notes', () => {
    expect(buildJobNotes('Weekday mornings', 'Has a dog — please call first')).toBe(
      'Preferred window: Weekday mornings\n\nHas a dog — please call first',
    )
  })

  it('omits the notes section when requestNotes is null', () => {
    expect(buildJobNotes('Any afternoon', null)).toBe('Preferred window: Any afternoon')
  })

  it('omits the notes section when requestNotes is empty string', () => {
    expect(buildJobNotes('Weekends only', '')).toBe('Preferred window: Weekends only')
  })
})

describe('confirmBookingSchema', () => {
  it('defaults leadSource to "web" when omitted', () => {
    const result = confirmBookingSchema.safeParse({})
    expect(result.success).toBe(true)
    expect(result.data?.leadSource).toBe('web')
  })

  it('defaults leadSource to "web" when explicitly undefined', () => {
    const result = confirmBookingSchema.safeParse({ leadSource: undefined })
    expect(result.success).toBe(true)
    expect(result.data?.leadSource).toBe('web')
  })

  it('accepts an override leadSource', () => {
    const result = confirmBookingSchema.safeParse({ leadSource: 'referral' })
    expect(result.success).toBe(true)
    expect(result.data?.leadSource).toBe('referral')
  })

  it('rejects a leadSource longer than 50 characters', () => {
    const result = confirmBookingSchema.safeParse({ leadSource: 'x'.repeat(51) })
    expect(result.success).toBe(false)
  })
})
