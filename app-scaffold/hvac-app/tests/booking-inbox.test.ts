import { describe, it, expect } from 'vitest'
import { bookingPublicUrl, partitionBookingRequests } from '@/app/bookings/helpers'

describe('bookingPublicUrl', () => {
  it('joins baseUrl and slug correctly', () => {
    expect(bookingPublicUrl('https://example.com', 'abc123')).toBe('https://example.com/book/abc123')
  })

  it('strips trailing slash from baseUrl', () => {
    expect(bookingPublicUrl('https://example.com/', 'abc123')).toBe('https://example.com/book/abc123')
  })

  it('returns null when slug is null', () => {
    expect(bookingPublicUrl('https://example.com', null)).toBeNull()
  })

  it('returns null when slug is undefined', () => {
    expect(bookingPublicUrl('https://example.com', undefined)).toBeNull()
  })

  it('returns null when slug is empty string', () => {
    expect(bookingPublicUrl('https://example.com', '')).toBeNull()
  })
})

describe('partitionBookingRequests', () => {
  const makeReq = (id: string, status: string) => ({ id, status })

  it('puts new-status items in newRequests', () => {
    const list = [makeReq('a', 'new'), makeReq('b', 'confirmed')]
    const { newRequests, handledRequests } = partitionBookingRequests(list)
    expect(newRequests).toHaveLength(1)
    expect(newRequests[0].id).toBe('a')
    expect(handledRequests).toHaveLength(1)
    expect(handledRequests[0].id).toBe('b')
  })

  it('treats confirmed and declined as handled', () => {
    const list = [makeReq('a', 'confirmed'), makeReq('b', 'declined'), makeReq('c', 'new')]
    const { newRequests, handledRequests } = partitionBookingRequests(list)
    expect(newRequests).toHaveLength(1)
    expect(handledRequests).toHaveLength(2)
  })

  it('returns empty arrays for empty input', () => {
    const { newRequests, handledRequests } = partitionBookingRequests([])
    expect(newRequests).toHaveLength(0)
    expect(handledRequests).toHaveLength(0)
  })

  it('preserves original order within each partition', () => {
    const list = [makeReq('z', 'new'), makeReq('a', 'new'), makeReq('m', 'confirmed')]
    const { newRequests } = partitionBookingRequests(list)
    expect(newRequests.map((r) => r.id)).toEqual(['z', 'a'])
  })
})
