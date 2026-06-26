import { describe, it, expect } from 'vitest'
import { parsePriceBookCsv, importRowSchema } from '../lib/validations/pricebook-import'

describe('importRowSchema', () => {
  it('accepts valid row data', () => {
    const result = importRowSchema.safeParse({ name: 'AC Tune-Up', category: 'Maintenance', flatPriceCents: 4999 })
    expect(result.success).toBe(true)
  })

  it('rejects empty name', () => {
    const result = importRowSchema.safeParse({ name: '', flatPriceCents: 0 })
    expect(result.success).toBe(false)
  })

  it('rejects negative flatPriceCents', () => {
    const result = importRowSchema.safeParse({ name: 'Test', flatPriceCents: -1 })
    expect(result.success).toBe(false)
  })
})

describe('parsePriceBookCsv', () => {
  it('parses valid multi-row CSV to correct cents', () => {
    const csv = 'name,category,flatPrice,cost\nAC Tune-Up,Maintenance,49.99,20.00\nFilter Replace,Filters,25.00,'
    const { rows, errors } = parsePriceBookCsv(csv)
    expect(errors).toHaveLength(0)
    expect(rows).toHaveLength(2)
    expect(rows[0].flatPriceCents).toBe(4999)
    expect(rows[0].costCents).toBe(2000)
    expect(rows[1].flatPriceCents).toBe(2500)
    expect(rows[1].costCents).toBeUndefined()
  })

  it('reports a row missing name as an error with its line number, not thrown', () => {
    const csv = 'name,category,flatPrice\nGood Item,Repair,50.00\n,NoName,30.00\nAnother,Install,75.00'
    const { rows, errors } = parsePriceBookCsv(csv)
    expect(rows).toHaveLength(2)
    expect(errors).toHaveLength(1)
    expect(errors[0].line).toBe(3)
    expect(typeof errors[0].message).toBe('string')
  })

  it('parses commas inside quoted fields correctly', () => {
    const csv = 'name,category,flatPrice\n"Service, Repair & More",Repair,99.00'
    const { rows, errors } = parsePriceBookCsv(csv)
    expect(errors).toHaveLength(0)
    expect(rows[0].name).toBe('Service, Repair & More')
    expect(rows[0].flatPriceCents).toBe(9900)
  })

  it('returns zero rows and no crash on empty input', () => {
    expect(parsePriceBookCsv('')).toEqual({ rows: [], errors: [] })
  })

  it('returns zero rows and no crash on whitespace-only input', () => {
    expect(parsePriceBookCsv('   \n  \n  ')).toEqual({ rows: [], errors: [] })
  })

  it('rounds dollars with extra precision correctly', () => {
    const csv = 'name,flatPrice\nTest Item,49.999'
    const { rows, errors } = parsePriceBookCsv(csv)
    expect(errors).toHaveLength(0)
    expect(rows[0].flatPriceCents).toBe(5000)
  })
})
