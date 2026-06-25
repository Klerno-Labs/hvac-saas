import { describe, it, expect } from 'vitest'
import { toCsv, flattenCustomer, flattenInvoice, isValidEntity } from '@/lib/export'

describe('toCsv', () => {
  it('quotes a value containing a comma', () => {
    const csv = toCsv([{ name: 'Smith, John' }])
    expect(csv).toContain('"Smith, John"')
  })

  it('doubles an embedded quote', () => {
    const csv = toCsv([{ name: 'Say "hello"' }])
    expect(csv).toContain('"Say ""hello"""')
  })

  it('quotes a value with a newline', () => {
    const csv = toCsv([{ notes: 'line1\nline2' }])
    expect(csv).toContain('"line1\nline2"')
  })

  it('header row matches keys', () => {
    const csv = toCsv([{ a: 1, b: 2 }])
    const lines = csv.split('\r\n')
    expect(lines[0]).toBe('a,b')
    expect(lines[1]).toBe('1,2')
  })

  it('returns empty string for empty input', () => {
    expect(toCsv([])).toBe('')
  })
})

describe('flattenCustomer', () => {
  it('produces documented columns with ISO dates', () => {
    const row = flattenCustomer({
      id: 'c1',
      firstName: 'Alice',
      lastName: 'Doe',
      companyName: 'ACME',
      email: 'a@b.com',
      phone: '555-1234',
      addressLine1: '1 Main St',
      addressLine2: null,
      city: 'Austin',
      state: 'TX',
      postalCode: '78701',
      notes: null,
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
    })
    expect(Object.keys(row)).toEqual([
      'id', 'firstName', 'lastName', 'companyName', 'email', 'phone',
      'addressLine1', 'addressLine2', 'city', 'state', 'postalCode', 'notes', 'createdAt',
    ])
    expect(row.createdAt).toBe('2024-01-01T00:00:00.000Z')
    expect(row.lastName).toBe('Doe')
    expect(row.addressLine2).toBeNull()
  })
})

describe('flattenInvoice', () => {
  it('keeps cents as integers and serializes dates as ISO', () => {
    const row = flattenInvoice({
      id: 'inv1',
      customerId: 'c1',
      jobId: 'j1',
      invoiceNumber: 'INV-001',
      status: 'paid',
      subtotalCents: 10000,
      taxCents: 800,
      totalCents: 10800,
      outstandingCents: 0,
      dueDate: new Date('2024-02-01T00:00:00.000Z'),
      paidAt: new Date('2024-01-15T00:00:00.000Z'),
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
    })
    expect(row.subtotalCents).toBe(10000)
    expect(row.taxCents).toBe(800)
    expect(row.totalCents).toBe(10800)
    expect(row.outstandingCents).toBe(0)
    expect(typeof row.subtotalCents).toBe('number')
    expect(row.paidAt).toBe('2024-01-15T00:00:00.000Z')
    expect(row.dueDate).toBe('2024-02-01T00:00:00.000Z')
    expect(row.createdAt).toBe('2024-01-01T00:00:00.000Z')
  })
})

describe('isValidEntity', () => {
  it('rejects unknown entities', () => {
    expect(isValidEntity('users')).toBe(false)
    expect(isValidEntity('')).toBe(false)
    expect(isValidEntity('accounts')).toBe(false)
  })

  it('accepts all valid entities', () => {
    expect(isValidEntity('customers')).toBe(true)
    expect(isValidEntity('jobs')).toBe(true)
    expect(isValidEntity('invoices')).toBe(true)
    expect(isValidEntity('payments')).toBe(true)
  })
})
