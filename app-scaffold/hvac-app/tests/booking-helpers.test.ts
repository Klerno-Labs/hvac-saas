import { describe, it, expect } from 'vitest'
import { generateBookingSlug, isValidBookingSlug } from '@/lib/booking'
import { createBookingRequestSchema } from '@/lib/validations/booking'

describe('generateBookingSlug', () => {
  it('returns a lowercase string', () => {
    const slug = generateBookingSlug('Acme HVAC')
    expect(slug).toBe(slug.toLowerCase())
  })

  it('matches isValidBookingSlug', () => {
    expect(isValidBookingSlug(generateBookingSlug('Acme HVAC'))).toBe(true)
    expect(isValidBookingSlug(generateBookingSlug('Cool Air Systems'))).toBe(true)
  })

  it('generates unique slugs (100 runs)', () => {
    const slugs = new Set(Array.from({ length: 100 }, () => generateBookingSlug('Test Org')))
    expect(slugs.size).toBe(100)
  })

  it('falls back to org-prefixed for empty name', () => {
    const slug = generateBookingSlug('')
    expect(slug.startsWith('org-')).toBe(true)
    expect(isValidBookingSlug(slug)).toBe(true)
  })

  it('falls back to org-prefixed for symbol-only name', () => {
    const slug = generateBookingSlug('!@#$%')
    expect(slug.startsWith('org-')).toBe(true)
    expect(isValidBookingSlug(slug)).toBe(true)
  })
})

describe('isValidBookingSlug', () => {
  it('accepts valid slugs', () => {
    expect(isValidBookingSlug('acme-hvac-x7f2k9')).toBe(true)
    expect(isValidBookingSlug('org-123456')).toBe(true)
    expect(isValidBookingSlug('ab')).toBe(true)
  })

  it('rejects uppercase', () => {
    expect(isValidBookingSlug('Acme-hvac')).toBe(false)
    expect(isValidBookingSlug('ACME')).toBe(false)
  })

  it('rejects leading hyphen', () => {
    expect(isValidBookingSlug('-acme')).toBe(false)
  })

  it('rejects trailing hyphen', () => {
    expect(isValidBookingSlug('acme-')).toBe(false)
  })

  it('rejects single character (too short)', () => {
    expect(isValidBookingSlug('a')).toBe(false)
  })

  it('rejects spaces', () => {
    expect(isValidBookingSlug('acme hvac')).toBe(false)
  })
})

describe('createBookingRequestSchema', () => {
  it('accepts a full valid payload', () => {
    const result = createBookingRequestSchema.safeParse({
      serviceType: 'AC Tune-Up',
      preferredWindow: 'Morning (8am-12pm)',
      contactName: 'Jane Smith',
      contactEmail: 'jane@example.com',
      contactPhone: '555-123-4567',
      address: '123 Main St',
      notes: 'Dog on premises',
    })
    expect(result.success).toBe(true)
  })

  it('accepts empty-string optional fields', () => {
    const result = createBookingRequestSchema.safeParse({
      serviceType: 'AC Tune-Up',
      preferredWindow: 'Anytime',
      contactName: 'Jane Smith',
      contactEmail: '',
      contactPhone: '555-123-4567',
      address: '',
      notes: '',
    })
    expect(result.success).toBe(true)
  })

  it('rejects empty serviceType', () => {
    const result = createBookingRequestSchema.safeParse({
      serviceType: '',
      preferredWindow: 'Morning',
      contactName: 'Jane',
      contactPhone: '555-000-0000',
    })
    expect(result.success).toBe(false)
  })

  it('rejects empty preferredWindow', () => {
    const result = createBookingRequestSchema.safeParse({
      serviceType: 'Repair',
      preferredWindow: '',
      contactName: 'Jane',
      contactPhone: '555-000-0000',
    })
    expect(result.success).toBe(false)
  })

  it('rejects empty contactName', () => {
    const result = createBookingRequestSchema.safeParse({
      serviceType: 'Repair',
      preferredWindow: 'Morning',
      contactName: '',
      contactPhone: '555-000-0000',
    })
    expect(result.success).toBe(false)
  })

  it('rejects empty contactPhone', () => {
    const result = createBookingRequestSchema.safeParse({
      serviceType: 'Repair',
      preferredWindow: 'Morning',
      contactName: 'Jane',
      contactPhone: '',
    })
    expect(result.success).toBe(false)
  })

  it('rejects invalid email format', () => {
    const result = createBookingRequestSchema.safeParse({
      serviceType: 'Repair',
      preferredWindow: 'Morning',
      contactName: 'Jane',
      contactPhone: '555-000-0000',
      contactEmail: 'not-an-email',
    })
    expect(result.success).toBe(false)
  })
})
