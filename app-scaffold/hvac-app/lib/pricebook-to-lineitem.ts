export type PriceBookItemForPicker = {
  id: string
  name: string
  description: string | null
  category: string | null
  sellPriceCents: number
}

export type EstimateLineItem = {
  name: string
  description: string
  quantity: number
  unitPriceCents: number
}

export function inventoryItemToLineItem(item: PriceBookItemForPicker): EstimateLineItem {
  return {
    name: item.name,
    description: item.description ?? '',
    quantity: 1,
    unitPriceCents: item.sellPriceCents,
  }
}
