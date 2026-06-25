export function centsToDollars(cents: number): string {
  return (cents / 100).toFixed(2)
}

export function dollarsToCents(dollars: string): number {
  return Math.round(parseFloat(dollars || '0') * 100)
}

export type OptionGroupFormState = {
  tier: 'good' | 'better' | 'best'
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
  optionGroups: OptionGroupFormState[]
}

type DbOptionGroup = {
  tier: string
  name: string
  description: string | null
  priceCents: number
  sortOrder: number
}

type DbPriceBookItem = {
  name: string
  category: string | null
  description: string | null
  flatPriceCents: number
  costCents: number | null
  imageUrl: string | null
  optionGroups: DbOptionGroup[]
}

export function priceBookItemToFormState(item: DbPriceBookItem): PriceBookFormState {
  return {
    name: item.name,
    category: item.category ?? '',
    description: item.description ?? '',
    flatPrice: centsToDollars(item.flatPriceCents),
    cost: item.costCents != null ? centsToDollars(item.costCents) : '',
    imageUrl: item.imageUrl ?? '',
    optionGroups: item.optionGroups
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((g) => ({
        tier: g.tier as 'good' | 'better' | 'best',
        name: g.name,
        description: g.description ?? '',
        price: centsToDollars(g.priceCents),
      })),
  }
}
