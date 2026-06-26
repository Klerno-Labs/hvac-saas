import { describe, it, expect } from 'vitest'
import {
  buildOptionGroupRows,
  createPriceBookItemSchema,
  PRICE_BOOK_TIERS,
} from '@/lib/validations/pricebook'

describe('buildOptionGroupRows', () => {
  it('assigns sortOrder by array index', () => {
    const groups = [
      { name: 'Brand', options: [{ label: 'Carrier', priceDeltaCents: 0 }] },
      { name: 'Warranty', options: [{ label: '5yr', priceDeltaCents: 20000 }] },
    ]
    const rows = buildOptionGroupRows(groups, 'org-1')
    expect(rows[0].sortOrder).toBe(0)
    expect(rows[1].sortOrder).toBe(1)
  })

  it('stamps organizationId onto every row', () => {
    const groups = [{ name: 'Size', options: [{ label: '2-ton', priceDeltaCents: 0 }] }]
    const rows = buildOptionGroupRows(groups, 'org-abc')
    expect(rows[0].organizationId).toBe('org-abc')
  })

  it('preserves options array verbatim', () => {
    const options = [
      { label: 'Basic', priceDeltaCents: 0 },
      { label: 'Premium', priceDeltaCents: 50000 },
    ]
    const rows = buildOptionGroupRows([{ name: 'Tier', options }], 'org-1')
    expect(rows[0].options).toEqual(options)
  })

  it('returns empty array for empty input', () => {
    expect(buildOptionGroupRows([], 'org-1')).toEqual([])
  })
})

describe('createPriceBookItemSchema', () => {
  const validInput = {
    name: 'AC Tune-Up',
    basePriceCents: 12900,
    costCents: 4500,
  }

  it('accepts valid input and applies defaults', () => {
    const result = createPriceBookItemSchema.safeParse(validInput)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.tier).toBe('STANDARD')
      expect(result.data.isActive).toBe(true)
      expect(result.data.optionGroups).toEqual([])
    }
  })

  it('requires name', () => {
    expect(createPriceBookItemSchema.safeParse({ ...validInput, name: '' }).success).toBe(false)
  })

  it('rejects negative basePriceCents', () => {
    expect(
      createPriceBookItemSchema.safeParse({ ...validInput, basePriceCents: -1 }).success,
    ).toBe(false)
  })

  it('rejects invalid tier', () => {
    expect(
      createPriceBookItemSchema.safeParse({ ...validInput, tier: 'PREMIUM' }).success,
    ).toBe(false)
  })

  it('accepts all valid tiers', () => {
    for (const tier of PRICE_BOOK_TIERS) {
      expect(createPriceBookItemSchema.safeParse({ ...validInput, tier }).success).toBe(true)
    }
  })

  it('rejects option group with empty options array', () => {
    const result = createPriceBookItemSchema.safeParse({
      ...validInput,
      optionGroups: [{ name: 'Brand', options: [] }],
    })
    expect(result.success).toBe(false)
  })

  it('accepts valid option groups', () => {
    const result = createPriceBookItemSchema.safeParse({
      ...validInput,
      optionGroups: [
        {
          name: 'Brand',
          options: [
            { label: 'Carrier', priceDeltaCents: 0 },
            { label: 'Lennox', priceDeltaCents: 10000 },
          ],
        },
      ],
    })
    expect(result.success).toBe(true)
  })
})
