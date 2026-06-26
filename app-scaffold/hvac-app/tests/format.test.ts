import { describe, it, expect } from 'vitest'
import { formatCents } from '@/lib/format'

describe('formatCents', () => {
  it('formats zero', () => {
    expect(formatCents(0)).toBe('$0.00')
  })

  it('formats 99 cents', () => {
    expect(formatCents(99)).toBe('$0.99')
  })

  it('formats 100 cents as one dollar', () => {
    expect(formatCents(100)).toBe('$1.00')
  })

  it('formats negative cents', () => {
    expect(formatCents(-500)).toBe('$-5.00')
  })
})
