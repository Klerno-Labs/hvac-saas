import { describe, it, expect } from 'vitest'
import { isValidBookingSlug } from '@/lib/booking'

describe('isValidBookingSlug', () => {
  it('accepts well-formed slugs', () => {
    expect(isValidBookingSlug('acme-hvac')).toBe(true)
    expect(isValidBookingSlug('abc')).toBe(true)
    expect(isValidBookingSlug('ab')).toBe(true)
    expect(isValidBookingSlug('my-company-123')).toBe(true)
    expect(isValidBookingSlug('a'.repeat(50))).toBe(true)
  })

  it('rejects slugs that would cause notFound()', () => {
    expect(isValidBookingSlug('')).toBe(false)
    expect(isValidBookingSlug('a')).toBe(false)            // too short
    expect(isValidBookingSlug('a'.repeat(51))).toBe(false) // too long
    expect(isValidBookingSlug('../etc/passwd')).toBe(false) // path traversal
    expect(isValidBookingSlug('UPPER-CASE')).toBe(false)   // uppercase not allowed
    expect(isValidBookingSlug('has spaces')).toBe(false)   // spaces not allowed
    expect(isValidBookingSlug('special!chars')).toBe(false)// special chars not allowed
    expect(isValidBookingSlug('-leading-hyphen')).toBe(false) // must start with alnum
  })
})
