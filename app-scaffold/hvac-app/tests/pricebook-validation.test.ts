import { describe, it, expect } from 'vitest'
import { createPriceBookItemSchema } from '@/lib/validations/pricebook'

const validItem = {
  name: 'AC Tune-Up',
  flatPriceCents: 12900,
  optionGroups: [
    { tier: 'good' as const, name: 'Basic', priceCents: 12900 },
    { tier: 'better' as const, name: 'Standard', priceCents: 17900 },
    { tier: 'best' as const, name: 'Premium', priceCents: 24900 },
  ],
}

describe('createPriceBookItemSchema', () => {
  it('accepts a valid item with good/better/best option groups', () => {
    expect(createPriceBookItemSchema.safeParse(validItem).success).toBe(true)
  })

  it('accepts an item with zero option groups', () => {
    const result = createPriceBookItemSchema.safeParse({ ...validItem, optionGroups: [] })
    expect(result.success).toBe(true)
  })

  it('rejects empty name', () => {
    const result = createPriceBookItemSchema.safeParse({ ...validItem, name: '' })
    expect(result.success).toBe(false)
  })

  it('rejects negative flatPriceCents', () => {
    const result = createPriceBookItemSchema.safeParse({ ...validItem, flatPriceCents: -1 })
    expect(result.success).toBe(false)
  })

  it('rejects an invalid tier value', () => {
    const result = createPriceBookItemSchema.safeParse({
      ...validItem,
      optionGroups: [{ tier: 'platinum', name: 'Elite', priceCents: 50000 }],
    })
    expect(result.success).toBe(false)
  })

  it('rejects negative option priceCents', () => {
    const result = createPriceBookItemSchema.safeParse({
      ...validItem,
      optionGroups: [{ tier: 'good' as const, name: 'Basic', priceCents: -100 }],
    })
    expect(result.success).toBe(false)
  })
})
