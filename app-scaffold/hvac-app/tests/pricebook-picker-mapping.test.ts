import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { PriceBookPicker } from '@/app/estimates/_components/pricebook-picker'
import { addEstimateLineItem, buildEstimateCatalog, catalogItemToLineItem, priceBookItemToLineItem } from '@/lib/pricebook-to-lineitem'
import { createEstimateSchema } from '@/lib/validations/estimate'

const baseItem = {
  id: 'item-1',
  name: 'Capacitor 35/5 MFD',
  description: 'Dual run capacitor',
  category: 'Parts',
  flatPriceCents: 4500,
}

describe('priceBookItemToLineItem', () => {
  it('maps flatPriceCents to unitPriceCents', () => {
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

describe('service and inventory estimate catalog', () => {
  const service = { ...baseItem, name: 'Service inspection', flatPriceCents: 14995, costCents: 2000 }
  const part = { ...baseItem, name: 'Replacement part', sellPriceCents: 3901, unitCostCents: 1000, quantityOnHand: 7 }
  const catalog = buildEstimateCatalog([service], [part])

  it('keeps distinct sources even for matching IDs, uses sale prices, and excludes costs and stock', () => {
    expect(catalog).toEqual([
      { id: baseItem.id, source: 'service', name: service.name, description: baseItem.description, category: baseItem.category, unitPriceCents: 14995 },
      { id: baseItem.id, source: 'inventory', name: part.name, description: baseItem.description, category: baseItem.category, unitPriceCents: 3901 },
    ])
    expect(catalog.map(catalogItemToLineItem).map(item => item.unitPriceCents)).toEqual([14995, 3901])
  })

  it('shows which source each add button uses and its exact customer price', () => {
    const html = renderToStaticMarkup(createElement(PriceBookPicker, { items: catalog, onPick: () => undefined }))
    expect(html).toContain('Price book services')
    expect(html).toContain('Inventory parts')
    expect(html).toContain('Add Service inspection (service)')
    expect(html).toContain('Add Replacement part (inventory part)')
    expect(html).toContain('$149.95')
    expect(html).toContain('$39.01')
    expect(html).toContain('does not reserve or reduce stock')
  })

  it('replaces the untouched starter row so a catalog-only estimate is valid', () => {
    const empty = [{ name: '', description: '', quantity: 1, unitPriceCents: 0 }]
    const selected = catalogItemToLineItem(catalog[0])
    const result = addEstimateLineItem(empty, selected)
    expect(result).toEqual([selected])
    expect(empty[0].name).toBe('')
    expect(createEstimateSchema.safeParse({ jobId: 'job', scopeOfWork: 'Inspect system', taxCents: 0, lineItems: result }).success).toBe(true)
  })

  it.each([
    { name: 'Free follow-up', description: '', quantity: 1, unitPriceCents: 0 },
    { name: '', description: 'Work already entered', quantity: 1, unitPriceCents: 0 },
    { name: '', description: '', quantity: 2, unitPriceCents: 0 },
    { name: '', description: '', quantity: 1, unitPriceCents: 1200 },
  ])('preserves an edited line when adding a catalog choice: %j', existing => {
    const selected = catalogItemToLineItem(catalog[0])
    expect(addEstimateLineItem([existing], selected)).toEqual([existing, selected])
  })

  it('copies prices so later catalog changes cannot rewrite a selected line', () => {
    const chosen = { ...catalog[0] }
    const line = catalogItemToLineItem(chosen)
    chosen.unitPriceCents = 20000
    expect(line.unitPriceCents).toBe(14995)
  })
})
