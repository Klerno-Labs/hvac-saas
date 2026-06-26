import { describe, it, expect } from 'vitest'
import { formatCents } from '@/lib/format'

describe('formatCents', () => {
  it('formats zero', () => {
    expect(formatCents(0)).toBe('$0.00')
  })

  it('formats sub-dollar amount (99 cents)', () => {
    expect(formatCents(99)).toBe('$0.99')
  })

  it('formats exactly 100 cents as $1.00', () => {
    expect(formatCents(100)).toBe('$1.00')
  })

  it('formats negative cents', () => {
    expect(formatCents(-500)).toBe('$-5.00')
  })

  it('formats a larger amount', () => {
    expect(formatCents(123456)).toBe('$1234.56')
  })
})
