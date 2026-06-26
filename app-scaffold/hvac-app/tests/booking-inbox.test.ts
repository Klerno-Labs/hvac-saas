import { describe, it, expect } from 'vitest'
import { bookingPublicUrl, partitionBookingRequests } from '@/app/bookings/helpers'

describe('bookingPublicUrl', () => {
  it('returns null when slug is null', () => {
    expect(bookingPublicUrl('https://app.example.com', null)).toBeNull()
  })

  it('builds the correct URL', () => {
    expect(bookingPublicUrl('https://app.example.com', 'abc123')).toBe(
      'https://app.example.com/book/abc123'
    )
  })

  it('strips trailing slash from baseUrl', () => {
    expect(bookingPublicUrl('https://app.example.com/', 'abc123')).toBe(
      'https://app.example.com/book/abc123'
    )
  })

  it('works with localhost base', () => {
    expect(bookingPublicUrl('http://localhost:3000', 'deadbeef')).toBe(
      'http://localhost:3000/book/deadbeef'
    )
  })
})

describe('partitionBookingRequests', () => {
  const requests = [
    { id: '1', status: 'new', createdAt: new Date('2024-01-03') },
    { id: '2', status: 'confirmed', createdAt: new Date('2024-01-02') },
    { id: '3', status: 'new', createdAt: new Date('2024-01-01') },
    { id: '4', status: 'declined', createdAt: new Date('2024-01-04') },
  ]

  it('puts new requests in newRequests', () => {
    const { newRequests } = partitionBookingRequests(requests)
    expect(newRequests.map((r) => r.id)).toEqual(['1', '3'])
  })

  it('puts confirmed and declined in handledRequests', () => {
    const { handledRequests } = partitionBookingRequests(requests)
    expect(handledRequests.map((r) => r.id)).toEqual(['2', '4'])
  })

  it('returns empty arrays for empty input', () => {
    const result = partitionBookingRequests([])
    expect(result.newRequests).toHaveLength(0)
    expect(result.handledRequests).toHaveLength(0)
  })

  it('preserves original order within each partition', () => {
    const { newRequests, handledRequests } = partitionBookingRequests(requests)
    expect(newRequests[0].id).toBe('1')
    expect(newRequests[1].id).toBe('3')
    expect(handledRequests[0].id).toBe('2')
    expect(handledRequests[1].id).toBe('4')
  })
})
