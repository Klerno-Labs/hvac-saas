import { describe, it, expect } from 'vitest'
import { inventoryItemToLineItem, type PriceBookItemForPicker } from '@/lib/pricebook-to-lineitem'

const base: PriceBookItemForPicker = {
  id: 'item-1',
  name: 'HEPA Filter 16x20',
  description: 'High-efficiency particulate filter',
  category: 'Filters',
  sellPriceCents: 4500,
}

describe('inventoryItemToLineItem', () => {
  it('maps name, description, sellPriceCents, and quantity correctly', () => {
    expect(inventoryItemToLineItem(base)).toEqual({
      name: 'HEPA Filter 16x20',
      description: 'High-efficiency particulate filter',
      quantity: 1,
      unitPriceCents: 4500,
    })
  })

  it('defaults quantity to 1', () => {
    expect(inventoryItemToLineItem(base).quantity).toBe(1)
  })

  it('uses sellPriceCents as unitPriceCents', () => {
    expect(inventoryItemToLineItem({ ...base, sellPriceCents: 12999 }).unitPriceCents).toBe(12999)
  })

  it('coerces null description to empty string', () => {
    expect(inventoryItemToLineItem({ ...base, description: null }).description).toBe('')
  })

  it('does not include unitCostCents or costCents on the output', () => {
    const result = inventoryItemToLineItem(base)
    expect('unitCostCents' in result).toBe(false)
    expect('costCents' in result).toBe(false)
  })
})
