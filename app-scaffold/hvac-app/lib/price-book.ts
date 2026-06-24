import { db } from '@/lib/db'

export type PriceBookPickerItem = {
  id: string
  name: string
  category: string | null
  description: string | null
  flatPriceCents: number
}

export type PriceBookPickerOption = {
  id: string
  tier: string
  name: string
  description: string | null
  priceCents: number
}

export type PriceBookPickerGroup = {
  id: string
  name: string
  category: string | null
  description: string | null
  options: PriceBookPickerOption[]
}

export type PriceBookCatalog = {
  items: PriceBookPickerItem[]
  groups: PriceBookPickerGroup[]
}

/**
 * Read the org-scoped price-book catalog for the estimate picker. Plain DB read
 * (no mutations) intended for use inside server components. Orgs are small
 * (1-5 tech shops) so no pagination, consistent with other list pages.
 */
export async function getPriceBookCatalog(organizationId: string): Promise<PriceBookCatalog> {
  const [items, groups] = await Promise.all([
    db.priceBookItem.findMany({
      where: { organizationId },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        category: true,
        description: true,
        flatPriceCents: true,
      },
    }),
    db.optionGroup.findMany({
      where: { organizationId },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        category: true,
        description: true,
        options: {
          orderBy: { sortOrder: 'asc' },
          select: {
            id: true,
            tier: true,
            name: true,
            description: true,
            priceCents: true,
          },
        },
      },
    }),
  ])

  return { items, groups }
}
