import { describe, it, expect } from 'vitest'
import { priceBookItemToLineItem } from '@/lib/pricebook-to-lineitem'

const baseItem = {
  id: 'item-1',
  name: 'Capacitor 35/5 MFD',
  description: 'Dual run capacitor',
  category: 'Parts',
  sellPriceCents: 4500,
}

describe('priceBookItemToLineItem', () => {
  it('maps sellPriceCents to unitPriceCents', () => {
    const li = priceBookItemToLineItem(baseItem)
    expect(li.unitPriceCents).toBe(4500)
  })

  it('sets quantity to 1', () => {
    const li = priceBookItemToLineItem(baseItem)
    expect(li.quantity).toBe(1)
  })

  it('copies name', () => {
    const li = priceBookItemToLineItem(baseItem)
    expect(li.name).toBe('Capacitor 35/5 MFD')
  })

  it('copies description', () => {
    const li = priceBookItemToLineItem(baseItem)
    expect(li.description).toBe('Dual run capacitor')
  })

  it('maps null description to empty string', () => {
    const li = priceBookItemToLineItem({ ...baseItem, description: null })
    expect(li.description).toBe('')
  })

  it('does not include costCents on the output', () => {
    const li = priceBookItemToLineItem(baseItem)
    expect('unitCostCents' in li).toBe(false)
    expect('costCents' in li).toBe(false)
  })
})
