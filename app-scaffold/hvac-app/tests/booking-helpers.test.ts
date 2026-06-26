import { describe, it, expect } from 'vitest'
import { generateBookingSlug, isValidBookingSlug } from '@/lib/booking'
import { createBookingRequestSchema } from '@/lib/validations/booking'

describe('generateBookingSlug', () => {
  it('returns a lowercase slug', () => {
    const slug = generateBookingSlug('Acme HVAC')
    expect(slug).toBe(slug.toLowerCase())
  })

  it('passes isValidBookingSlug', () => {
    expect(isValidBookingSlug(generateBookingSlug('Acme HVAC'))).toBe(true)
  })

  it('generates 100 unique slugs', () => {
    const slugs = new Set(Array.from({ length: 100 }, () => generateBookingSlug('Test Org')))
    expect(slugs.size).toBe(100)
  })

  it('falls back to org prefix for empty name', () => {
    const slug = generateBookingSlug('')
    expect(slug).toMatch(/^org-/)
  })

  it('falls back to org prefix for non-alphanumeric-only name', () => {
    const slug = generateBookingSlug('!!!---!!!')
    expect(slug).toMatch(/^org-/)
  })

  it('strips non-alphanumeric characters from prefix', () => {
    const slug = generateBookingSlug('A&B Heating + Cooling')
    expect(slug).toMatch(/^a-b-heating-cooling-/)
  })
})

describe('isValidBookingSlug', () => {
  it('accepts a valid slug', () => {
    expect(isValidBookingSlug('acme-hvac-x7f2k9')).toBe(true)
  })

  it('accepts a minimal two-char slug', () => {
    expect(isValidBookingSlug('ab')).toBe(true)
  })

  it('rejects uppercase', () => {
    expect(isValidBookingSlug('Acme-hvac')).toBe(false)
  })

  it('rejects leading hyphen', () => {
    expect(isValidBookingSlug('-acme-hvac')).toBe(false)
  })

  it('rejects trailing hyphen', () => {
    expect(isValidBookingSlug('acme-hvac-')).toBe(false)
  })

  it('rejects single character (too short)', () => {
    expect(isValidBookingSlug('a')).toBe(false)
  })

  it('rejects slugs with spaces', () => {
    expect(isValidBookingSlug('acme hvac')).toBe(false)
  })
})

describe('createBookingRequestSchema', () => {
  const valid = {
    serviceType: 'AC Tune-Up',
    preferredWindow: 'Morning (8am–12pm)',
    contactName: 'Jane Smith',
    contactPhone: '555-867-5309',
  }

  it('accepts a minimal valid payload', () => {
    expect(() => createBookingRequestSchema.parse(valid)).not.toThrow()
  })

  it('accepts a full payload with optional fields as empty strings', () => {
    expect(() =>
      createBookingRequestSchema.parse({
        ...valid,
        contactEmail: '',
        address: '',
        notes: '',
      }),
    ).not.toThrow()
  })

  it('accepts a full payload with all optional fields populated', () => {
    expect(() =>
      createBookingRequestSchema.parse({
        ...valid,
        contactEmail: 'jane@example.com',
        address: '123 Main St',
        notes: 'Please call before arriving.',
      }),
    ).not.toThrow()
  })

  it('rejects empty serviceType', () => {
    const result = createBookingRequestSchema.safeParse({ ...valid, serviceType: '' })
    expect(result.success).toBe(false)
  })

  it('rejects empty preferredWindow', () => {
    const result = createBookingRequestSchema.safeParse({ ...valid, preferredWindow: '' })
    expect(result.success).toBe(false)
  })

  it('rejects empty contactName', () => {
    const result = createBookingRequestSchema.safeParse({ ...valid, contactName: '' })
    expect(result.success).toBe(false)
  })

  it('rejects empty contactPhone', () => {
    const result = createBookingRequestSchema.safeParse({ ...valid, contactPhone: '' })
    expect(result.success).toBe(false)
  })

  it('rejects invalid contactEmail when provided', () => {
    const result = createBookingRequestSchema.safeParse({ ...valid, contactEmail: 'not-an-email' })
    expect(result.success).toBe(false)
  })
})
