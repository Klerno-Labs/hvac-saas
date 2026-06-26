export function centsToDollars(cents: number): string {
  return (cents / 100).toFixed(2)
}

export function dollarsToCents(dollars: string): number {
  return Math.round(parseFloat(dollars || '0') * 100)
}

export type PriceBookOptionGroupFormRow = {
  tier: string
  name: string
  description: string
  price: string
}

export type PriceBookFormState = {
  name: string
  category: string
  description: string
  flatPrice: string
  cost: string
  imageUrl: string
  optionGroups: PriceBookOptionGroupFormRow[]
}

export type PriceBookItemForForm = {
  name: string
  category: string | null
  description: string | null
  flatPriceCents: number
  costCents: number
  imageUrl: string | null
  optionGroups: {
    tier: string
    name: string
    description: string | null
    priceCents: number
    sortOrder: number
  }[]
}

export function itemToFormState(item: PriceBookItemForForm): PriceBookFormState {
  return {
    name: item.name,
    category: item.category ?? '',
    description: item.description ?? '',
    flatPrice: centsToDollars(item.flatPriceCents),
    cost: centsToDollars(item.costCents),
    imageUrl: item.imageUrl ?? '',
    optionGroups: item.optionGroups.map((og) => ({
      tier: og.tier,
      name: og.name,
      description: og.description ?? '',
      price: centsToDollars(og.priceCents),
    })),
  }
}
