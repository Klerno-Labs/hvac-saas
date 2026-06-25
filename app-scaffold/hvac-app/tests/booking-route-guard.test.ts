import { describe, it, expect } from 'vitest'
import { isValidBookingSlug } from '@/lib/booking'

describe('isValidBookingSlug', () => {
  it('accepts a two-character slug', () => {
    expect(isValidBookingSlug('ab')).toBe(true)
  })

  it('accepts a typical org slug', () => {
    expect(isValidBookingSlug('smiths-hvac')).toBe(true)
  })

  it('accepts a slug with numbers', () => {
    expect(isValidBookingSlug('cool-air-1')).toBe(true)
  })

  it('accepts a 50-character slug', () => {
    expect(isValidBookingSlug('a' + 'b'.repeat(48) + 'c')).toBe(true)
  })

  it('rejects an empty string', () => {
    expect(isValidBookingSlug('')).toBe(false)
  })

  it('rejects a single character', () => {
    expect(isValidBookingSlug('a')).toBe(false)
  })

  it('rejects a slug starting with a hyphen', () => {
    expect(isValidBookingSlug('-invalid')).toBe(false)
  })

  it('rejects a slug ending with a hyphen', () => {
    expect(isValidBookingSlug('invalid-')).toBe(false)
  })

  it('rejects uppercase letters', () => {
    expect(isValidBookingSlug('UPPERCASE')).toBe(false)
  })

  it('rejects slugs with spaces', () => {
    expect(isValidBookingSlug('has spaces')).toBe(false)
  })

  it('rejects slugs with special characters', () => {
    expect(isValidBookingSlug('special!chars')).toBe(false)
  })

  it('rejects a 51-character slug', () => {
    expect(isValidBookingSlug('a'.repeat(51))).toBe(false)
  })

  it('rejects path traversal attempts', () => {
    expect(isValidBookingSlug('../etc/passwd')).toBe(false)
  })
})
