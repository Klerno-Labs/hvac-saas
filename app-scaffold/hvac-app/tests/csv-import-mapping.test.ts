import { describe, it, expect } from 'vitest'
import { applyMapping } from '@/lib/csv-import/mapping'
import { getEntitySpec } from '@/lib/csv-import/specs'

describe('applyMapping – customers', () => {
  const spec = getEntitySpec('customers')
  const headers = ['First Name', 'Last Name', 'Email', 'Phone', 'Notes']
  const mapping = {
    firstName: 'First Name',
    lastName: 'Last Name',
    email: 'Email',
    phone: 'Phone',
    notes: 'Notes',
  }

  it('maps columns by header name', () => {
    const rows = [['John', 'Doe', 'john@example.com', '555-1234', 'vip']]
    const result = applyMapping(rows, headers, mapping, spec)
    expect(result[0]).toMatchObject({
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@example.com',
      phone: '555-1234',
      notes: 'vip',
    })
  })

  it('trims whitespace from cell values', () => {
    const rows = [['  John  ', '  Doe  ', '  john@example.com  ', '555-1234', '']]
    const result = applyMapping(rows, headers, mapping, spec)
    expect(result[0].firstName).toBe('John')
    expect(result[0].lastName).toBe('Doe')
    expect(result[0].email).toBe('john@example.com')
  })

  it('omits fields not present in mapping', () => {
    const partialMapping = { firstName: 'First Name', phone: 'Phone' }
    const rows = [['John', 'Doe', 'john@example.com', '555-1234', 'vip']]
    const result = applyMapping(rows, headers, partialMapping, spec)
    expect(result[0]).toHaveProperty('firstName', 'John')
    expect(result[0]).toHaveProperty('phone', '555-1234')
    expect(result[0]).not.toHaveProperty('email')
    expect(result[0]).not.toHaveProperty('notes')
  })

  it('handles empty cells as empty string', () => {
    const rows = [['Jane', '', '', '555-5678', '']]
    const result = applyMapping(rows, headers, mapping, spec)
    expect(result[0].lastName).toBe('')
    expect(result[0].email).toBe('')
  })

  it('maps multiple rows independently', () => {
    const rows = [
      ['Alice', 'A', 'alice@example.com', '111-1111', ''],
      ['Bob', 'B', 'bob@example.com', '222-2222', 'note'],
    ]
    const result = applyMapping(rows, headers, mapping, spec)
    expect(result).toHaveLength(2)
    expect(result[0].firstName).toBe('Alice')
    expect(result[1].firstName).toBe('Bob')
  })

  it('ignores mapping entries whose source header is not in headers', () => {
    const badMapping = { firstName: 'First Name', phone: 'Phone', notes: 'NonexistentColumn' }
    const rows = [['John', 'Doe', 'x@x.com', '555-0000', 'note']]
    const result = applyMapping(rows, headers, badMapping, spec)
    expect(result[0]).toHaveProperty('firstName', 'John')
    expect(result[0]).not.toHaveProperty('notes')
  })
})

describe('applyMapping – pricebook', () => {
  const spec = getEntitySpec('pricebook')
  const headers = ['Item Name', 'SKU', 'Sell Price', 'Cost']
  const mapping = {
    name: 'Item Name',
    sku: 'SKU',
    sellPriceCents: 'Sell Price',
    unitCostCents: 'Cost',
  }

  it('maps pricebook columns correctly', () => {
    const rows = [['16x20 Air Filter', 'FLTR-1620', '12.99', '4.50']]
    const result = applyMapping(rows, headers, mapping, spec)
    expect(result[0]).toMatchObject({
      name: '16x20 Air Filter',
      sku: 'FLTR-1620',
      sellPriceCents: '12.99',
      unitCostCents: '4.50',
    })
  })
})

describe('applyMapping – equipment', () => {
  const spec = getEntitySpec('equipment')
  const headers = ['Type', 'Make', 'Serial', 'Customer Email']
  const mapping = {
    type: 'Type',
    make: 'Make',
    serial: 'Serial',
    customerEmail: 'Customer Email',
  }

  it('maps equipment columns correctly', () => {
    const rows = [['ac_condenser', 'Carrier', 'SN123456', 'owner@example.com']]
    const result = applyMapping(rows, headers, mapping, spec)
    expect(result[0]).toMatchObject({
      type: 'ac_condenser',
      make: 'Carrier',
      serial: 'SN123456',
      customerEmail: 'owner@example.com',
    })
  })
})
