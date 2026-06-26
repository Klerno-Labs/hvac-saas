import { describe, it, expect } from 'vitest'
import { parseCsv, suggestMapping } from '@/lib/csv/parse'
import {
  dollarsToCents,
  customerImportSchema,
  equipmentImportSchema,
  pricebookImportSchema,
} from '@/lib/validations/import'

describe('parseCsv', () => {
  it('handles quoted commas', () => {
    const { headers, rows } = parseCsv('name,city\n"Smith, John",Austin')
    expect(headers).toEqual(['name', 'city'])
    expect(rows[0]).toEqual({ name: 'Smith, John', city: 'Austin' })
  })

  it('handles quoted newlines', () => {
    const { rows } = parseCsv('"name","notes"\n"Alice","line1\nline2"')
    expect(rows[0]['notes']).toBe('line1\nline2')
  })

  it('handles "" escaped double-quotes', () => {
    const { rows } = parseCsv('value\n"say ""hi"""')
    expect(rows[0]['value']).toBe('say "hi"')
  })
})

describe('suggestMapping', () => {
  it('maps aliased headers to target fields', () => {
    const m = suggestMapping(['First Name', 'E-mail'], 'customers')
    expect(m['firstName']).toBe('First Name')
    expect(m['email']).toBe('E-mail')
  })

  it('returns null for unmatched fields', () => {
    const m = suggestMapping(['First Name'], 'customers')
    expect(m['email']).toBeNull()
  })
})

describe('dollarsToCents', () => {
  it('parses a dollar amount string', () => {
    expect(dollarsToCents('$1,234.56')).toBe(123456)
  })

  it('returns 0 for empty string', () => {
    expect(dollarsToCents('')).toBe(0)
  })
})

describe('customerImportSchema', () => {
  it('accepts a valid row without phone', () => {
    expect(customerImportSchema.safeParse({ firstName: 'Jane' }).success).toBe(true)
  })

  it('rejects an invalid email format', () => {
    expect(
      customerImportSchema.safeParse({ firstName: 'Jane', email: 'not-an-email' }).success,
    ).toBe(false)
  })
})

describe('equipmentImportSchema', () => {
  it('accepts a valid row with a known equipment type', () => {
    expect(equipmentImportSchema.safeParse({ type: 'furnace' }).success).toBe(true)
  })

  it('rejects an unknown equipment type', () => {
    expect(equipmentImportSchema.safeParse({ type: 'spaceship' }).success).toBe(false)
  })
})

describe('pricebookImportSchema', () => {
  it('accepts dollar-string prices and converts to cents', () => {
    const result = pricebookImportSchema.safeParse({
      name: 'Air Filter',
      unitCostCents: '$5.00',
      sellPriceCents: '$10.00',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.unitCostCents).toBe(500)
      expect(result.data.sellPriceCents).toBe(1000)
    }
  })

  it('rejects a missing name', () => {
    expect(pricebookImportSchema.safeParse({ name: '' }).success).toBe(false)
  })
})
