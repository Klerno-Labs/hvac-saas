import { z } from 'zod'

export const PRICE_BOOK_TIERS = ['good', 'better', 'best'] as const
export type PriceBookTier = (typeof PRICE_BOOK_TIERS)[number]

const optionGroupInputSchema = z.object({
  name: z.string().min(1, 'Option group name is required').max(200),
  description: z.string().max(2000).optional().or(z.literal('')),
  priceCents: z.coerce.number().int().min(0, 'Price must be 0 or more'),
})

export type OptionGroupInput = z.infer<typeof optionGroupInputSchema>

export const createPriceBookItemSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  category: z.string().max(100).optional().or(z.literal('')),
  description: z.string().max(2000).optional().or(z.literal('')),
  basePriceCents: z.coerce.number().int().min(0, 'Base price must be 0 or more'),
  costCents: z.coerce.number().int().min(0, 'Cost must be 0 or more'),
  tier: z.enum(PRICE_BOOK_TIERS).optional(),
  isActive: z.boolean().default(true),
  optionGroups: z.array(optionGroupInputSchema).default([]),
})

export type CreatePriceBookItemInput = z.infer<typeof createPriceBookItemSchema>

export const updatePriceBookItemSchema = createPriceBookItemSchema

export type UpdatePriceBookItemInput = z.infer<typeof updatePriceBookItemSchema>

/**
 * Maps validated option-group inputs to Prisma-ready rows, stamping
 * organizationId and sortOrder. Pure — no DB calls.
 */
export function buildOptionGroupRows(
  groups: OptionGroupInput[],
  organizationId: string,
): Array<{
  name: string
  description: string | null
  priceCents: number
  organizationId: string
  sortOrder: number
}> {
  return groups.map((og, i) => ({
    name: og.name,
    description: og.description || null,
    priceCents: og.priceCents,
    organizationId,
    sortOrder: i,
  }))
}
