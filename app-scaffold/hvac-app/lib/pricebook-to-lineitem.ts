export type PriceBookItem = {
  id: string
  name: string
  description: string | null
  category: string | null
  sellPriceCents: number
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
    unitPriceCents: item.sellPriceCents,
  }
}
