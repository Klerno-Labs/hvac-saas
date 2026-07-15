import { describe, it, expect } from 'vitest'
import { parseCsv, suggestMapping, FIELD_DEFS } from '@/lib/csv/parse'
import {
  dollarsToCents,
  customerImportSchema,
  equipmentImportSchema,
  pricebookImportSchema,
} from '@/lib/validations/import'

// ---------------------------------------------------------------------------
// parseCsv — RFC-4180 edge cases
// ---------------------------------------------------------------------------

describe('parseCsv', () => {
  it('parses a simple CSV', () => {
    const { headers, rows } = parseCsv('name,age\nAlice,30\nBob,25')
    expect(headers).toEqual(['name', 'age'])
    expect(rows).toEqual([
      { name: 'Alice', age: '30' },
      { name: 'Bob', age: '25' },
    ])
  })

  it('handles quoted commas', () => {
    const { rows } = parseCsv('a,b\n"hello, world",two')
    expect(rows[0]['a']).toBe('hello, world')
    expect(rows[0]['b']).toBe('two')
  })

  it('handles quoted newlines', () => {
    const { rows } = parseCsv('a,b\n"line one\nline two",end')
    expect(rows[0]['a']).toBe('line one\nline two')
    expect(rows[0]['b']).toBe('end')
  })

  it('handles escaped double-quotes ("")', () => {
    const { rows } = parseCsv('a,b\n"say ""hello""",world')
    expect(rows[0]['a']).toBe('say "hello"')
  })

  it('pads short rows with empty strings', () => {
    const { rows } = parseCsv('a,b,c\n1,2')
    expect(rows[0]['c']).toBe('')
  })

  it('returns empty result for whitespace-only input', () => {
    expect(parseCsv('   \n  ')).toEqual({ headers: [], rows: [] })
  })

  it('exports FIELD_DEFS with at least one required field per kind', () => {
    const kinds = ['customers', 'equipment', 'pricebook'] as const
    for (const kind of kinds) {
      expect(FIELD_DEFS[kind].some((f) => f.required)).toBe(true)
    }
  })
})

// ---------------------------------------------------------------------------
// suggestMapping — alias-based column matching
// ---------------------------------------------------------------------------

describe('suggestMapping', () => {
  it('maps "First Name" and "E-mail" to the correct customer fields', () => {
    const mapping = suggestMapping(['First Name', 'E-mail', 'Mobile'], 'customers')
    expect(mapping['firstName']).toBe('First Name')
    expect(mapping['email']).toBe('E-mail')
    expect(mapping['phone']).toBe('Mobile')
  })

  it('returns null for a required field that has no matching header', () => {
    const mapping = suggestMapping(['City', 'State'], 'customers')
    expect(mapping['firstName']).toBeNull()
  })

  it('does not assign the same source header to two fields', () => {
    const mapping = suggestMapping(['email', 'phone'], 'customers')
    const values = Object.values(mapping).filter(Boolean)
    const unique = new Set(values)
    expect(unique.size).toBe(values.length)
  })

  it('maps equipment type column variants', () => {
    const mapping = suggestMapping(['Equipment Type', 'Serial #'], 'equipment')
    expect(mapping['type']).toBe('Equipment Type')
    expect(mapping['serial']).toBe('Serial #')
  })

  it('maps pricebook sell price column', () => {
    const mapping = suggestMapping(['Name', 'SKU', 'Unit Price'], 'pricebook')
    expect(mapping['name']).toBe('Name')
    expect(mapping['sku']).toBe('SKU')
    expect(mapping['sellPriceCents']).toBe('Unit Price')
  })
})

// ---------------------------------------------------------------------------
// dollarsToCents
// ---------------------------------------------------------------------------

describe('dollarsToCents', () => {
  it('parses $1,234.56 to 123456', () => {
    expect(dollarsToCents('$1,234.56')).toBe(123456)
  })

  it('returns 0 for empty string', () => {
    expect(dollarsToCents('')).toBe(0)
  })

  it('parses plain number strings', () => {
    expect(dollarsToCents('9.99')).toBe(999)
    expect(dollarsToCents('100')).toBe(10000)
  })

  it('returns 0 for non-numeric input', () => {
    expect(dollarsToCents('N/A')).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// customerImportSchema
// ---------------------------------------------------------------------------

describe('customerImportSchema', () => {
  it('accepts a valid row', () => {
    const result = customerImportSchema.safeParse({
      firstName: 'Jane',
      email: 'jane@example.com',
    })
    expect(result.success).toBe(true)
  })

  it('accepts a row without phone (phone is optional)', () => {
    const result = customerImportSchema.safeParse({ firstName: 'Jane' })
    expect(result.success).toBe(true)
  })

  it('rejects a bad email format', () => {
    const result = customerImportSchema.safeParse({
      firstName: 'Jane',
      email: 'not-an-email',
    })
    expect(result.success).toBe(false)
  })

  it('rejects a missing firstName', () => {
    const result = customerImportSchema.safeParse({ firstName: '' })
    expect(result.success).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// equipmentImportSchema
// ---------------------------------------------------------------------------

describe('equipmentImportSchema', () => {
  it('accepts a valid row', () => {
    const result = equipmentImportSchema.safeParse({
      type: 'furnace',
      customerEmail: 'owner@example.com',
      tonnage: '3.5',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.tonnage).toBe(3.5)
    }
  })

  it('coerces numeric string fields', () => {
    const result = equipmentImportSchema.safeParse({
      type: 'ac_condenser',
      btu: '24000',
      partsWarrantyMonths: '12',
      laborWarrantyMonths: '24',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.btu).toBe(24000)
      expect(result.data.partsWarrantyMonths).toBe(12)
    }
  })

  it('rejects an unknown equipment type', () => {
    const result = equipmentImportSchema.safeParse({ type: 'jacuzzi' })
    expect(result.success).toBe(false)
  })

  it('does not require customerId', () => {
    const result = equipmentImportSchema.safeParse({ type: 'boiler' })
    expect(result.success).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// pricebookImportSchema
// ---------------------------------------------------------------------------

describe('pricebookImportSchema', () => {
  it('accepts a valid row with dollar strings', () => {
    const result = pricebookImportSchema.safeParse({
      name: 'R-410A Refrigerant',
      sku: 'REF-410A',
      unitCostCents: '$18.50',
      sellPriceCents: '$29.99',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.unitCostCents).toBe(1850)
      expect(result.data.sellPriceCents).toBe(2999)
    }
  })

  it('accepts a row with comma-formatted prices', () => {
    const result = pricebookImportSchema.safeParse({
      name: 'Compressor',
      sellPriceCents: '$1,234.56',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.sellPriceCents).toBe(123456)
    }
  })

  it('rejects a missing name', () => {
    const result = pricebookImportSchema.safeParse({ name: '' })
    expect(result.success).toBe(false)
  })

  it('accepts a row without sku', () => {
    const result = pricebookImportSchema.safeParse({ name: 'Labor' })
    expect(result.success).toBe(true)
  })
})
