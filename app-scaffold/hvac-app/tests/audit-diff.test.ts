import { describe, it, expect } from 'vitest'
import { diffSummary } from '@/lib/audit'

describe('diffSummary', () => {
  it('returns only changed fields', () => {
    const before = { name: 'Alice', phone: '555', status: 'active' }
    const after = { name: 'Bob', phone: '555', status: 'active' }
    expect(diffSummary(before, after)).toEqual([
      { field: 'name', from: 'Alice', to: 'Bob' },
    ])
  })

  it('equal objects return []', () => {
    const obj = { name: 'Alice', phone: '555' }
    expect(diffSummary(obj, { ...obj })).toEqual([])
  })

  it('create (before=null) lists all after fields with from=null', () => {
    const after = { name: 'Alice', status: 'active' }
    expect(diffSummary(null, after)).toEqual([
      { field: 'name', from: null, to: 'Alice' },
      { field: 'status', from: null, to: 'active' },
    ])
  })

  it('delete (after=null) lists all before fields with to=null', () => {
    const before = { name: 'Alice', status: 'active' }
    expect(diffSummary(before, null)).toEqual([
      { field: 'name', from: 'Alice', to: null },
      { field: 'status', from: 'active', to: null },
    ])
  })

  it('redacts hashedPassword and token in both from and to', () => {
    const before = { hashedPassword: 'hash1', token: 'tok1', name: 'Alice' }
    const after = { hashedPassword: 'hash2', token: 'tok2', name: 'Bob' }
    const result = diffSummary(before, after)
    const hp = result.find(r => r.field === 'hashedPassword')!
    const tk = result.find(r => r.field === 'token')!
    expect(hp.from).toBe('[REDACTED]')
    expect(hp.to).toBe('[REDACTED]')
    expect(tk.from).toBe('[REDACTED]')
    expect(tk.to).toBe('[REDACTED]')
  })

  it('opts.fields restricts the compared keys', () => {
    const before = { name: 'Alice', phone: '555', status: 'active' }
    const after = { name: 'Bob', phone: '999', status: 'active' }
    expect(diffSummary(before, after, { fields: ['name'] })).toEqual([
      { field: 'name', from: 'Alice', to: 'Bob' },
    ])
  })
})
