import { describe, it, expect } from 'vitest'
import {
  rowsToCsv,
  rowsToJson,
  projectRow,
  exportFilename,
  EXPORT_ENTITIES,
  type Row,
} from '@/lib/csv-export'

const customerRow: Row = {
  id: 'c1',
  firstName: 'Ann',
  lastName: 'Smith',
  companyName: null,
  email: 'ann@example.com',
  phone: '555-1234',
  addressLine1: '1 Main St',
  addressLine2: null,
  city: 'Town',
  state: 'CA',
  postalCode: '90210',
  notes: 'VIP, careful',
  createdAt: new Date('2026-01-02T03:04:05.000Z'),
  updatedAt: new Date('2026-01-03T00:00:00.000Z'),
}

describe('projectRow', () => {
  it('keeps only the columns defined for the entity', () => {
    const cols = EXPORT_ENTITIES.customers.columns
    const out = projectRow(customerRow, cols)
    expect(Object.keys(out).sort()).toEqual(
      cols.map((c) => c.key).sort(),
    )
    expect(out.firstName).toBe('Ann')
    expect(out.companyName).toBeNull()
  })

  it('serializes Date values to ISO strings', () => {
    const out = projectRow(customerRow, EXPORT_ENTITIES.customers.columns)
    expect(out.createdAt).toBe('2026-01-02T03:04:05.000Z')
  })
})

describe('rowsToCsv', () => {
  it('produces a header row in column order', () => {
    const csv = rowsToCsv([customerRow], EXPORT_ENTITIES.customers.columns)
    const header = csv.split('\n')[0]
    expect(header).toBe(
      'id,firstName,lastName,companyName,email,phone,addressLine1,addressLine2,city,state,postalCode,notes,createdAt,updatedAt',
    )
  })

  it('emits one data row per input row', () => {
    const csv = rowsToCsv([customerRow, customerRow], EXPORT_ENTITIES.customers.columns)
    const lines = csv.trim().split('\n')
    expect(lines).toHaveLength(3) // header + 2 rows
  })

  it('returns just the header for an empty row set', () => {
    const csv = rowsToCsv([], EXPORT_ENTITIES.customers.columns)
    expect(csv.trim().split('\n')).toHaveLength(1)
  })

  it('escapes commas, quotes and newlines per RFC-4180', () => {
    const tricky: Row = { ...customerRow, notes: 'has, comma and "quote" and\nnewline' }
    const csv = rowsToCsv([tricky], EXPORT_ENTITIES.customers.columns)
    // The quoted field must be wrapped in double quotes and internal quotes doubled.
    expect(csv).toContain('"has, comma and ""quote"" and\nnewline"')
  })

  it('renders null cells as empty strings', () => {
    const csv = rowsToCsv([customerRow], EXPORT_ENTITIES.customers.columns)
    // companyName is null -> empty (between lastName and email columns)
    const dataRow = csv.split('\n')[1]
    expect(dataRow).toContain('Ann,Smith,,ann@example.com')
  })

  it('renders invoice cents columns as bare integers', () => {
    const invoice: Row = {
      id: 'inv1',
      invoiceNumber: 'INV-0001',
      customerId: 'c1',
      jobId: 'j1',
      status: 'paid',
      subtotalCents: 10000,
      taxCents: 500,
      totalCents: 10500,
      outstandingCents: 0,
      dueDate: null,
      sentAt: null,
      paidAt: null,
      createdAt: new Date('2026-01-02T00:00:00.000Z'),
    }
    const csv = rowsToCsv([invoice], EXPORT_ENTITIES.invoices.columns)
    const dataRow = csv.split('\n')[1]
    expect(dataRow).toContain(',10000,500,10500,0,')
  })
})

describe('rowsToJson', () => {
  it('produces valid JSON matching the column shape', () => {
    const json = rowsToJson([customerRow], EXPORT_ENTITIES.customers.columns)
    const parsed = JSON.parse(json)
    expect(parsed).toHaveLength(1)
    expect(parsed[0].firstName).toBe('Ann')
    expect(parsed[0].companyName).toBeNull()
    expect(parsed[0].createdAt).toBe('2026-01-02T03:04:05.000Z')
  })

  it('produces an array (possibly empty) for zero rows', () => {
    expect(JSON.parse(rowsToJson([], EXPORT_ENTITIES.customers.columns))).toEqual([])
  })
})

describe('exportFilename', () => {
  it('includes entity and format, csv extension', () => {
    const name = exportFilename('invoices', 'csv')
    expect(name).toMatch(/^invoices-\d{4}-\d{2}-\d{2}\.csv$/)
  })

  it('uses json extension for json format', () => {
    expect(exportFilename('payments', 'json')).toMatch(/^payments-\d{4}-\d{2}-\d{2}\.json$/)
  })
})
