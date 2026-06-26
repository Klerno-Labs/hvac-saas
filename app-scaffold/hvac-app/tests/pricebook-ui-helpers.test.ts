import { describe, it, expect } from 'vitest'
import {
  centsToDollars,
  dollarsToCents,
  itemToFormState,
  type PriceBookItemForForm,
} from '@/lib/pricebook-form'

describe('centsToDollars', () => {
  it('converts zero correctly', () => {
    expect(centsToDollars(0)).toBe('0.00')
  })

  it('converts whole dollars', () => {
    expect(centsToDollars(100)).toBe('1.00')
  })

  it('converts cents with decimal', () => {
    expect(centsToDollars(1299)).toBe('12.99')
  })

  it('rounds to two decimal places', () => {
    expect(centsToDollars(333)).toBe('3.33')
  })
})

describe('dollarsToCents', () => {
  it('converts whole dollars', () => {
    expect(dollarsToCents('10')).toBe(1000)
  })

  it('converts decimal dollars', () => {
    expect(dollarsToCents('12.99')).toBe(1299)
  })

  it('handles empty string as zero', () => {
    expect(dollarsToCents('')).toBe(0)
  })

  it('rounds half-cent values', () => {
    expect(dollarsToCents('0.005')).toBe(1)
  })
})

describe('itemToFormState', () => {
  const baseItem: PriceBookItemForForm = {
    name: 'AC Tune-Up',
    category: 'Maintenance',
    description: 'Annual tune-up service',
    flatPriceCents: 9900,
    costCents: 4000,
    imageUrl: null,
    optionGroups: [],
  }

  it('maps scalar fields correctly', () => {
    const state = itemToFormState(baseItem)
    expect(state.name).toBe('AC Tune-Up')
    expect(state.category).toBe('Maintenance')
    expect(state.description).toBe('Annual tune-up service')
    expect(state.flatPrice).toBe('99.00')
    expect(state.cost).toBe('40.00')
    expect(state.imageUrl).toBe('')
    expect(state.optionGroups).toHaveLength(0)
  })

  it('converts null nullable fields to empty strings', () => {
    const state = itemToFormState({ ...baseItem, category: null, description: null })
    expect(state.category).toBe('')
    expect(state.description).toBe('')
  })

  it('maps option groups with cents-to-dollars conversion', () => {
    const item: PriceBookItemForForm = {
      ...baseItem,
      optionGroups: [
        { tier: 'good', name: 'Basic', description: null, priceCents: 7900, sortOrder: 0 },
        { tier: 'better', name: 'Standard', description: 'More features', priceCents: 12900, sortOrder: 1 },
      ],
    }
    const state = itemToFormState(item)
    expect(state.optionGroups).toHaveLength(2)
    expect(state.optionGroups[0]).toEqual({
      tier: 'good',
      name: 'Basic',
      description: '',
      price: '79.00',
    })
    expect(state.optionGroups[1]).toEqual({
      tier: 'better',
      name: 'Standard',
      description: 'More features',
      price: '129.00',
    })
  })
})
