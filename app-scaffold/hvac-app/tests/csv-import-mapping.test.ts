import { describe, it, expect } from 'vitest'
import { applyMapping, suggestMapping } from '@/lib/csv-import/mapping'
import { ENTITY_SPECS } from '@/lib/csv-import/specs'

describe('applyMapping — customers', () => {
  const spec = ENTITY_SPECS.customers
  const headers = ['First Name', 'Last Name', 'Phone', 'Email']
  const mapping = { firstName: 'First Name', lastName: 'Last Name', phone: 'Phone', email: 'Email' }

  it('extracts mapped fields by column header', () => {
    const result = applyMapping([['Alice', 'Smith', '555-1234', 'alice@example.com']], headers, mapping, spec)
    expect(result).toEqual([{ firstName: 'Alice', lastName: 'Smith', phone: '555-1234', email: 'alice@example.com' }])
  })

  it('trims whitespace from cell values', () => {
    const result = applyMapping([['  Alice  ', ' Smith ', ' 555-1234 ', '']], headers, mapping, spec)
    expect(result[0].firstName).toBe('Alice')
    expect(result[0].lastName).toBe('Smith')
    expect(result[0].phone).toBe('555-1234')
    expect(result[0].email).toBe('')
  })

  it('omits fields that are not in the mapping', () => {
    const partial = { firstName: 'First Name', phone: 'Phone' }
    const result = applyMapping([['Alice', 'Smith', '555-1234', 'alice@example.com']], headers, partial, spec)
    expect(result[0]).toHaveProperty('firstName')
    expect(result[0]).toHaveProperty('phone')
    expect(result[0]).not.toHaveProperty('lastName')
    expect(result[0]).not.toHaveProperty('email')
  })

  it('handles multiple rows', () => {
    const rows = [
      ['Alice', 'Smith', '555-1234', 'alice@example.com'],
      ['Bob', 'Jones', '555-5678', 'bob@example.com'],
    ]
    const result = applyMapping(rows, headers, mapping, spec)
    expect(result).toHaveLength(2)
    expect(result[0].firstName).toBe('Alice')
    expect(result[1].firstName).toBe('Bob')
    expect(result[1].email).toBe('bob@example.com')
  })

  it('returns empty array for empty rows input', () => {
    expect(applyMapping([], headers, mapping, spec)).toEqual([])
  })

  it('ignores a mapping that references a header not in the headers list', () => {
    const badMapping = { firstName: 'Nonexistent Column', phone: 'Phone' }
    const result = applyMapping([['Alice', 'Smith', '555-1234', '']], headers, badMapping, spec)
    expect(result[0]).not.toHaveProperty('firstName')
    expect(result[0].phone).toBe('555-1234')
  })
})

describe('applyMapping — pricebook', () => {
  const spec = ENTITY_SPECS.pricebook
  const headers = ['Name', 'SKU', 'Price', 'Cost']
  const mapping = { name: 'Name', sku: 'SKU', sellPriceCents: 'Price', unitCostCents: 'Cost' }

  it('maps pricebook columns correctly', () => {
    const result = applyMapping([['20x20 Filter', 'FLT-20', '12.99', '6.50']], headers, mapping, spec)
    expect(result[0].name).toBe('20x20 Filter')
    expect(result[0].sku).toBe('FLT-20')
    expect(result[0].sellPriceCents).toBe('12.99')
    expect(result[0].unitCostCents).toBe('6.50')
  })
})

describe('applyMapping — equipment', () => {
  const spec = ENTITY_SPECS.equipment
  const headers = ['Type', 'Make', 'Serial', 'Customer Email']
  const mapping = { type: 'Type', make: 'Make', serial: 'Serial', customerEmail: 'Customer Email' }

  it('maps equipment columns and trims values', () => {
    const result = applyMapping([['  ac_condenser  ', 'Carrier', 'SN-001', 'owner@example.com']], headers, mapping, spec)
    expect(result[0].type).toBe('ac_condenser')
    expect(result[0].make).toBe('Carrier')
    expect(result[0].serial).toBe('SN-001')
    expect(result[0].customerEmail).toBe('owner@example.com')
  })
})

describe('suggestMapping — customers', () => {
  const spec = ENTITY_SPECS.customers

  it('matches exact aliases', () => {
    const headers = ['first name', 'last name', 'phone', 'email']
    const m = suggestMapping(headers, spec)
    expect(m.firstName).toBe('first name')
    expect(m.lastName).toBe('last name')
    expect(m.phone).toBe('phone')
    expect(m.email).toBe('email')
  })

  it('never assigns the same source header to two fields', () => {
    const headers = ['phone']
    const m = suggestMapping(headers, spec)
    const vals = Object.values(m).filter(Boolean)
    expect(new Set(vals).size).toBe(vals.length)
  })

  it('returns empty mapping when headers are empty', () => {
    expect(suggestMapping([], spec)).toEqual({})
  })

  it('matches common CRM aliases case-insensitively', () => {
    const headers = ['First', 'Mobile', 'Email Address']
    const m = suggestMapping(headers, spec)
    expect(m.firstName).toBe('First')
    expect(m.phone).toBe('Mobile')
    expect(m.email).toBe('Email Address')
  })
})

describe('suggestMapping — pricebook', () => {
  const spec = ENTITY_SPECS.pricebook

  it('maps price book column aliases', () => {
    const headers = ['name', 'sku', 'sell price', 'unit cost', 'quantity']
    const m = suggestMapping(headers, spec)
    expect(m.name).toBe('name')
    expect(m.sku).toBe('sku')
    expect(m.sellPriceCents).toBe('sell price')
    expect(m.unitCostCents).toBe('unit cost')
    expect(m.quantityOnHand).toBe('quantity')
  })
})
