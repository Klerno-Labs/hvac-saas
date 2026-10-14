export type PriceBookItem = {
  id: string
  name: string
  description: string | null
  category: string | null
  flatPriceCents: number
}

export type InventoryPriceItem = Omit<PriceBookItem, 'flatPriceCents'> & { sellPriceCents: number }
export type EstimateCatalogItem = Omit<PriceBookItem, 'flatPriceCents'> & {
  source: 'service' | 'inventory'
  unitPriceCents: number
}

export type EstimateLineItemInput = {
  name: string
  description: string
  quantity: number
  unitPriceCents: number
}

export function priceBookItemToLineItem(item: PriceBookItem): EstimateLineItemInput {
  return {
    name: item.name,
    description: item.description ?? '',
    quantity: 1,
    unitPriceCents: item.flatPriceCents,
  }
}

/** Copy customer-facing prices only; neither costs nor inventory quantities enter a quote. */
export function buildEstimateCatalog(services: PriceBookItem[], inventory: InventoryPriceItem[]): EstimateCatalogItem[] {
  return [
    ...services.map(({ id, name, description, category, flatPriceCents }) => ({
      id, name, description, category, source: 'service' as const, unitPriceCents: flatPriceCents,
    })),
    ...inventory.map(({ id, name, description, category, sellPriceCents }) => ({
      id, name, description, category, source: 'inventory' as const, unitPriceCents: sellPriceCents,
    })),
  ]
}

export function catalogItemToLineItem(item: EstimateCatalogItem): EstimateLineItemInput {
  return { name: item.name, description: item.description ?? '', quantity: 1, unitPriceCents: item.unitPriceCents }
}

/** A picker choice fills an untouched starter row without replacing work already entered. */
export function addEstimateLineItem(items: EstimateLineItemInput[], addition: EstimateLineItemInput): EstimateLineItemInput[] {
  const emptyIndex = items.findIndex(item => !item.name.trim() && !item.description.trim() && item.quantity === 1 && item.unitPriceCents === 0)
  return emptyIndex < 0 ? [...items, addition] : items.map((item, index) => index === emptyIndex ? addition : item)
}
