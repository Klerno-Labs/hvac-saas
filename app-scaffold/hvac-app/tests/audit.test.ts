import { describe, it, expect } from 'vitest'
import { summarizeChanges } from '@/lib/audit'

describe('summarizeChanges', () => {
  it('returns only fields whose value changed', () => {
    const before = { firstName: 'Ann', lastName: 'Smith', phone: '555' }
    const after = { firstName: 'Ann', lastName: 'Jones', phone: '555' }
    expect(summarizeChanges(before, after)).toEqual({
      lastName: { from: 'Smith', to: 'Jones' },
    })
  })

  it('ignores keys present only in before (not being mutated)', () => {
    const before = { id: 'c1', firstName: 'Ann', email: 'a@x.com' }
    const after = { firstName: 'Anne' }
    // id + email are not in `after` -> not part of the diff
    expect(summarizeChanges(before, after)).toEqual({
      firstName: { from: 'Ann', to: 'Anne' },
    })
  })

  it('treats undefined and null as equal (no spurious diff)', () => {
    const before = { notes: null }
    const after = { notes: undefined }
    expect(summarizeChanges(before, after)).toEqual({})
  })

  it('detects setting a field to null as a change', () => {
    const before = { lastName: 'Smith' }
    const after = { lastName: null }
    expect(summarizeChanges(before, after)).toEqual({
      lastName: { from: 'Smith', to: null },
    })
  })

  it('normalizes Date to ISO string', () => {
    const d = new Date('2026-01-02T03:04:05.000Z')
    const before = { dueDate: d }
    const after = { dueDate: new Date('2026-02-03T00:00:00.000Z') }
    expect(summarizeChanges(before, after)).toEqual({
      dueDate: { from: '2026-01-02T03:04:05.000Z', to: '2026-02-03T00:00:00.000Z' },
    })
  })

  it('truncates long strings to keep the audit log bounded', () => {
    const long = 'x'.repeat(500)
    const before = { notes: 'short' }
    const after = { notes: long }
    const diff = summarizeChanges(before, after)
    expect(diff.notes.to).toHaveLength(200)
    expect((diff.notes.to as string).endsWith('...')).toBe(true)
    expect(diff.notes.from).toBe('short')
  })

  it('compares numbers by value (10000 !== 10001)', () => {
    const before = { totalCents: 10000 }
    const after = { totalCents: 10001 }
    expect(summarizeChanges(before, after)).toEqual({
      totalCents: { from: 10000, to: 10001 },
    })
  })

  it('respects the include option to add keys not in after', () => {
    const before = { a: 1, b: 2, c: 3 }
    const after = { a: 1 } // a unchanged, b/c not listed
    const diff = summarizeChanges(before, after, ['b'])
    // b is in before(2) vs after(undefined->null) => change
    expect(diff).toEqual({ b: { from: 2, to: null } })
  })

  it('reduces objects and arrays to a bounded shape summary', () => {
    const before = { meta: { x: 1 } }
    const after = { meta: { x: 1, y: 2, z: 3 } }
    const diff = summarizeChanges(before, after)
    expect(diff.meta.from).toBe('{1 keys}')
    expect(diff.meta.to).toBe('{3 keys}')
  })

  it('returns {} when nothing changed', () => {
    expect(summarizeChanges({ a: 1 }, { a: 1 })).toEqual({})
  })
})
