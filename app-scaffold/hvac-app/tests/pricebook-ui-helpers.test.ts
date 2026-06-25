import { describe, it, expect } from 'vitest'
import {
  centsToDollars,
  dollarsToCents,
  priceBookItemToFormState,
} from '@/lib/pricebook-mappers'

describe('centsToDollars', () => {
  it('converts 0 to "0.00"', () => {
    expect(centsToDollars(0)).toBe('0.00')
  })

  it('converts 1500 to "15.00"', () => {
    expect(centsToDollars(1500)).toBe('15.00')
  })

  it('converts 999 to "9.99"', () => {
    expect(centsToDollars(999)).toBe('9.99')
  })

  it('converts 12900 to "129.00"', () => {
    expect(centsToDollars(12900)).toBe('129.00')
  })
})

describe('dollarsToCents', () => {
  it('converts "0" to 0', () => {
    expect(dollarsToCents('0')).toBe(0)
  })

  it('converts "15.00" to 1500', () => {
    expect(dollarsToCents('15.00')).toBe(1500)
  })

  it('converts "9.99" to 999', () => {
    expect(dollarsToCents('9.99')).toBe(999)
  })

  it('handles empty string as 0', () => {
    expect(dollarsToCents('')).toBe(0)
  })

  it('rounds half-cents correctly', () => {
    expect(dollarsToCents('1.005')).toBe(101)
  })
})

describe('priceBookItemToFormState', () => {
  const baseItem = {
    name: 'AC Tune-Up',
    category: 'Maintenance',
    description: 'Annual tune-up service',
    flatPriceCents: 12900,
    costCents: 5000,
    imageUrl: null,
    optionGroups: [
      { tier: 'good', name: 'Basic', description: null, priceCents: 9900, sortOrder: 0 },
      { tier: 'better', name: 'Standard', description: 'With filter change', priceCents: 14900, sortOrder: 1 },
      { tier: 'best', name: 'Premium', description: null, priceCents: 19900, sortOrder: 2 },
    ],
  }

  it('maps name, category, description verbatim', () => {
    const state = priceBookItemToFormState(baseItem)
    expect(state.name).toBe('AC Tune-Up')
    expect(state.category).toBe('Maintenance')
    expect(state.description).toBe('Annual tune-up service')
  })

  it('converts flatPriceCents to dollar string', () => {
    const state = priceBookItemToFormState(baseItem)
    expect(state.flatPrice).toBe('129.00')
  })

  it('converts costCents to dollar string', () => {
    const state = priceBookItemToFormState(baseItem)
    expect(state.cost).toBe('50.00')
  })

  it('maps option groups in sortOrder order', () => {
    const shuffled = {
      ...baseItem,
      optionGroups: [
        { tier: 'best', name: 'Premium', description: null, priceCents: 19900, sortOrder: 2 },
        { tier: 'good', name: 'Basic', description: null, priceCents: 9900, sortOrder: 0 },
        { tier: 'better', name: 'Standard', description: null, priceCents: 14900, sortOrder: 1 },
      ],
    }
    const state = priceBookItemToFormState(shuffled)
    expect(state.optionGroups[0].tier).toBe('good')
    expect(state.optionGroups[1].tier).toBe('better')
    expect(state.optionGroups[2].tier).toBe('best')
  })

  it('converts option group priceCents to dollar strings', () => {
    const state = priceBookItemToFormState(baseItem)
    expect(state.optionGroups[0].price).toBe('99.00')
    expect(state.optionGroups[1].price).toBe('149.00')
  })

  it('converts null description in option group to empty string', () => {
    const state = priceBookItemToFormState(baseItem)
    expect(state.optionGroups[0].description).toBe('')
    expect(state.optionGroups[1].description).toBe('With filter change')
  })

  it('handles all null optional fields', () => {
    const minimal = {
      name: 'Test Item',
      category: null,
      description: null,
      flatPriceCents: 0,
      costCents: null,
      imageUrl: null,
      optionGroups: [],
    }
    const state = priceBookItemToFormState(minimal)
    expect(state.category).toBe('')
    expect(state.description).toBe('')
    expect(state.cost).toBe('')
    expect(state.imageUrl).toBe('')
    expect(state.optionGroups).toHaveLength(0)
  })
})
