import { describe, it, expect } from 'vitest'
import {
  toCsv,
  flattenCustomer,
  flattenInvoice,
  EXPORT_ENTITIES,
  isExportEntity,
} from '@/lib/export'

describe('toCsv', () => {
  it('quotes a field containing a comma', () => {
    const csv = toCsv([{ name: 'Smith, John' }])
    expect(csv).toContain('"Smith, John"')
  })

  it('doubles embedded quotes', () => {
    const csv = toCsv([{ note: 'say "hello"' }])
    expect(csv).toContain('"say ""hello"""')
  })

  it('quotes a field containing a newline', () => {
    const csv = toCsv([{ text: 'line1\nline2' }])
    expect(csv).toContain('"line1\nline2"')
  })

  it('produces header row matching object keys', () => {
    const csv = toCsv([{ id: '1', name: 'Acme' }])
    const header = csv.split('\r\n')[0]
    expect(header).toBe('id,name')
  })

  it('returns empty string for empty input', () => {
    expect(toCsv([])).toBe('')
  })
})

describe('flattenCustomer', () => {
  it('produces all documented columns', () => {
    const row = {
      id: 'c1', firstName: 'Jane', lastName: 'Doe', companyName: null,
      email: 'jane@example.com', phone: null, addressLine1: '123 Main St',
      addressLine2: null, city: 'Springfield', state: 'IL', postalCode: '62701',
      notes: null, createdAt: new Date('2024-01-15T00:00:00.000Z'),
    }
    const flat = flattenCustomer(row)
    expect(Object.keys(flat)).toEqual([
      'id', 'firstName', 'lastName', 'companyName', 'email', 'phone',
      'addressLine1', 'addressLine2', 'city', 'state', 'postalCode', 'notes', 'createdAt',
    ])
    expect(flat.id).toBe('c1')
    expect(flat.email).toBe('jane@example.com')
  })

  it('serializes Date to ISO string', () => {
    const flat = flattenCustomer({ createdAt: new Date('2025-06-01T12:00:00.000Z') })
    expect(flat.createdAt).toBe('2025-06-01T12:00:00.000Z')
  })
})

describe('flattenInvoice', () => {
  it('produces all documented columns with cents as integers', () => {
    const row = {
      id: 'inv1', customerId: 'c1', jobId: 'j1', invoiceNumber: 'INV-001',
      status: 'paid', subtotalCents: 10000, taxCents: 800, totalCents: 10800,
      outstandingCents: 0, dueDate: null,
      paidAt: new Date('2024-03-10T00:00:00.000Z'),
      createdAt: new Date('2024-03-01T00:00:00.000Z'),
    }
    const flat = flattenInvoice(row)
    // Cents must remain as integer — never divided
    expect(flat.subtotalCents).toBe(10000)
    expect(flat.taxCents).toBe(800)
    expect(flat.totalCents).toBe(10800)
    expect(flat.outstandingCents).toBe(0)
    expect(flat.paidAt).toBe('2024-03-10T00:00:00.000Z')
    expect(flat.createdAt).toBe('2024-03-01T00:00:00.000Z')
    expect(flat.dueDate).toBeNull()
  })
})

describe('EXPORT_ENTITIES / isExportEntity', () => {
  it('contains all expected entities', () => {
    expect(EXPORT_ENTITIES).toContain('customers')
    expect(EXPORT_ENTITIES).toContain('jobs')
    expect(EXPORT_ENTITIES).toContain('invoices')
    expect(EXPORT_ENTITIES).toContain('payments')
  })

  it('rejects unknown entities', () => {
    expect(isExportEntity('users')).toBe(false)
    expect(isExportEntity('sessions')).toBe(false)
    expect(isExportEntity('')).toBe(false)
  })

  it('accepts valid entities', () => {
    expect(isExportEntity('customers')).toBe(true)
    expect(isExportEntity('payments')).toBe(true)
  })
})
