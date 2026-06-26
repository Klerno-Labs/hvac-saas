import { describe, it, expect } from 'vitest'
import {
  buildOptionGroupRows,
  createPriceBookItemSchema,
  updatePriceBookItemSchema,
  PRICE_BOOK_TIERS,
} from '@/lib/validations/pricebook'

describe('buildOptionGroupRows', () => {
  it('stamps organizationId and incremental sortOrder onto each row', () => {
    const groups = [
      { name: 'Basic', priceCents: 0 },
      { name: 'Standard', priceCents: 5000 },
      { name: 'Premium', priceCents: 12000 },
    ]
    const rows = buildOptionGroupRows(groups, 'org_1')
    expect(rows).toHaveLength(3)
    expect(rows[0]).toEqual({ name: 'Basic', description: null, priceCents: 0, organizationId: 'org_1', sortOrder: 0 })
    expect(rows[1].sortOrder).toBe(1)
    expect(rows[2].sortOrder).toBe(2)
    rows.forEach(r => expect(r.organizationId).toBe('org_1'))
  })

  it('coerces missing description to null', () => {
    const rows = buildOptionGroupRows([{ name: 'Only', priceCents: 0 }], 'org_2')
    expect(rows[0].description).toBeNull()
  })

  it('coerces empty-string description to null', () => {
    const rows = buildOptionGroupRows([{ name: 'A', description: '', priceCents: 0 }], 'org_3')
    expect(rows[0].description).toBeNull()
  })

  it('preserves non-empty description', () => {
    const rows = buildOptionGroupRows([{ name: 'A', description: 'Details here', priceCents: 100 }], 'org_4')
    expect(rows[0].description).toBe('Details here')
  })

  it('returns empty array for empty input', () => {
    expect(buildOptionGroupRows([], 'org_5')).toEqual([])
  })
})

describe('createPriceBookItemSchema', () => {
  const valid = {
    name: 'AC Install',
    basePriceCents: 150000,
    costCents: 90000,
    tier: 'better' as const,
    optionGroups: [{ name: 'Basic', priceCents: 0 }],
  }

  it('accepts a valid item', () => {
    expect(createPriceBookItemSchema.safeParse(valid).success).toBe(true)
  })

  it('requires name', () => {
    const result = createPriceBookItemSchema.safeParse({ ...valid, name: '' })
    expect(result.success).toBe(false)
  })

  it('rejects negative basePriceCents', () => {
    const result = createPriceBookItemSchema.safeParse({ ...valid, basePriceCents: -1 })
    expect(result.success).toBe(false)
  })

  it('rejects invalid tier', () => {
    const result = createPriceBookItemSchema.safeParse({ ...valid, tier: 'platinum' })
    expect(result.success).toBe(false)
  })

  it('accepts all PRICE_BOOK_TIERS values', () => {
    for (const tier of PRICE_BOOK_TIERS) {
      expect(createPriceBookItemSchema.safeParse({ ...valid, tier }).success).toBe(true)
    }
  })

  it('defaults optionGroups to empty array', () => {
    const result = createPriceBookItemSchema.safeParse({ ...valid, optionGroups: undefined })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.optionGroups).toEqual([])
  })

  it('requires option group name', () => {
    const result = createPriceBookItemSchema.safeParse({
      ...valid,
      optionGroups: [{ name: '', priceCents: 0 }],
    })
    expect(result.success).toBe(false)
  })
})

describe('updatePriceBookItemSchema', () => {
  it('shares the same rules as createPriceBookItemSchema', () => {
    const valid = { name: 'Heat Pump', basePriceCents: 0, costCents: 0 }
    expect(updatePriceBookItemSchema.safeParse(valid).success).toBe(true)
    expect(updatePriceBookItemSchema.safeParse({ ...valid, name: '' }).success).toBe(false)
  })
})
