import { describe, it, expect } from 'vitest'
import { parsePriceBookCsv, importRowSchema } from '@/lib/validations/pricebook-import'

describe('parsePriceBookCsv', () => {
  it('parses a valid multi-row CSV to correct cents', () => {
    const csv = [
      'name,category,description,flatPrice,cost,imageUrl',
      'AC Tune-Up,Maintenance,Annual check,49.99,20.00,',
      'Filter Replacement,Parts,,12.50,,',
    ].join('\n')

    const { rows, errors } = parsePriceBookCsv(csv)
    expect(errors).toHaveLength(0)
    expect(rows).toHaveLength(2)
    expect(rows[0].name).toBe('AC Tune-Up')
    expect(rows[0].flatPriceCents).toBe(4999)
    expect(rows[0].costCents).toBe(2000)
    expect(rows[1].flatPriceCents).toBe(1250)
    expect(rows[1].costCents).toBeUndefined()
  })

  it('reports an error with line number for a row missing name, does not throw', () => {
    const csv = [
      'name,category,flatPrice',
      ',Maintenance,49.99',
    ].join('\n')

    const { rows, errors } = parsePriceBookCsv(csv)
    expect(rows).toHaveLength(0)
    expect(errors).toHaveLength(1)
    expect(errors[0].line).toBe(2)
    expect(errors[0].message).toContain('Name is required')
  })

  it('handles commas inside double-quoted fields', () => {
    const csv = [
      'name,category,description,flatPrice',
      '"Tune-Up, Filter & Check",Maintenance,"Full service, includes parts",149.99',
    ].join('\n')

    const { rows, errors } = parsePriceBookCsv(csv)
    expect(errors).toHaveLength(0)
    expect(rows).toHaveLength(1)
    expect(rows[0].name).toBe('Tune-Up, Filter & Check')
    expect(rows[0].description).toBe('Full service, includes parts')
    expect(rows[0].flatPriceCents).toBe(14999)
  })

  it('returns zero rows and no errors for an empty/whitespace file', () => {
    expect(parsePriceBookCsv('')).toEqual({ rows: [], errors: [] })
    expect(parsePriceBookCsv('   \n  \n')).toEqual({ rows: [], errors: [] })
  })

  it('rounds dollars with extra decimal precision correctly', () => {
    const csv = [
      'name,flatPrice',
      'Capacitor,185.999',
    ].join('\n')

    const { rows } = parsePriceBookCsv(csv)
    expect(rows[0].flatPriceCents).toBe(18600)
  })
})

describe('importRowSchema', () => {
  it('accepts a valid row', () => {
    const result = importRowSchema.safeParse({
      name: 'AC Tune-Up',
      flatPriceCents: 4999,
      costCents: 2000,
      category: 'Maintenance',
    })
    expect(result.success).toBe(true)
  })

  it('rejects a row with missing name', () => {
    const result = importRowSchema.safeParse({ name: '', flatPriceCents: 100 })
    expect(result.success).toBe(false)
  })

  it('rejects negative flatPriceCents', () => {
    const result = importRowSchema.safeParse({ name: 'Test', flatPriceCents: -1 })
    expect(result.success).toBe(false)
  })

  it('allows optional costCents to be absent', () => {
    const result = importRowSchema.safeParse({ name: 'Test', flatPriceCents: 0 })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.costCents).toBeUndefined()
    }
  })
})
