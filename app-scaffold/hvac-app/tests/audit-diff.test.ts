import { describe, it, expect } from 'vitest'
import { diffSummary } from '@/lib/audit'

describe('diffSummary', () => {
  it('returns only changed fields for an update', () => {
    const result = diffSummary({ name: 'Alice', phone: '123' }, { name: 'Bob', phone: '123' })
    expect(result).toEqual([{ field: 'name', from: 'Alice', to: 'Bob' }])
  })

  it('returns [] when objects are equal', () => {
    expect(diffSummary({ name: 'Alice' }, { name: 'Alice' })).toEqual([])
  })

  it('lists all after fields with from=null for a create (before=null)', () => {
    const result = diffSummary(null, { name: 'Alice', email: 'a@b.com' })
    expect(result).toHaveLength(2)
    expect(result).toContainEqual({ field: 'name', from: null, to: 'Alice' })
    expect(result).toContainEqual({ field: 'email', from: null, to: 'a@b.com' })
  })

  it('lists all before fields with to=null for a delete (after=null)', () => {
    const result = diffSummary({ name: 'Alice', email: 'a@b.com' }, null)
    expect(result).toHaveLength(2)
    expect(result).toContainEqual({ field: 'name', from: 'Alice', to: null })
    expect(result).toContainEqual({ field: 'email', from: 'a@b.com', to: null })
  })

  it('redacts sensitive keys (hashedPassword, token) in both from and to', () => {
    const result = diffSummary(
      { hashedPassword: 'old-hash', token: 'old-tok', name: 'Alice' },
      { hashedPassword: 'new-hash', token: 'new-tok', name: 'Bob' },
    )
    const pw = result.find(r => r.field === 'hashedPassword')!
    const tok = result.find(r => r.field === 'token')!
    expect(pw.from).toBe('[REDACTED]')
    expect(pw.to).toBe('[REDACTED]')
    expect(tok.from).toBe('[REDACTED]')
    expect(tok.to).toBe('[REDACTED]')
    // non-sensitive field is not redacted
    expect(result.find(r => r.field === 'name')?.from).toBe('Alice')
  })

  it('restricts comparison to opts.fields when provided', () => {
    const result = diffSummary(
      { name: 'Alice', phone: '123', email: 'a@b.com' },
      { name: 'Bob', phone: '456', email: 'a@b.com' },
      { fields: ['name'] },
    )
    expect(result).toEqual([{ field: 'name', from: 'Alice', to: 'Bob' }])
  })
})
