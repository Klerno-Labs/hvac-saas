import { z } from 'zod'

export const PRICE_BOOK_TIERS = ['GOOD', 'BETTER', 'BEST', 'STANDARD'] as const
export type PriceBookTier = (typeof PRICE_BOOK_TIERS)[number]

const optionSchema = z.object({
  label: z.string().min(1, 'Option label is required').max(200),
  priceDeltaCents: z.number().int(),
})

const optionGroupSchema = z.object({
  name: z.string().min(1, 'Option group name is required').max(200),
  options: z.array(optionSchema).min(1, 'Each option group must have at least one option'),
})

export type OptionGroupInput = z.infer<typeof optionGroupSchema>
export type OptionInput = z.infer<typeof optionSchema>

export const createPriceBookItemSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  description: z.string().max(2000).optional().or(z.literal('')),
  category: z.string().max(100).optional().or(z.literal('')),
  tier: z.enum(PRICE_BOOK_TIERS).default('STANDARD'),
  basePriceCents: z.number().int().min(0, 'Price must be 0 or more'),
  costCents: z.number().int().min(0, 'Cost must be 0 or more'),
  isActive: z.boolean().default(true),
  optionGroups: z.array(optionGroupSchema).default([]),
})

export type CreatePriceBookItemInput = z.infer<typeof createPriceBookItemSchema>

export const updatePriceBookItemSchema = createPriceBookItemSchema

export type UpdatePriceBookItemInput = z.infer<typeof updatePriceBookItemSchema>

/**
 * Maps validated option group input to Prisma-ready rows, stamping
 * organizationId and sortOrder (by array index) onto each row.
 */
export function buildOptionGroupRows(
  groups: OptionGroupInput[],
  organizationId: string,
): Array<{ name: string; sortOrder: number; options: OptionInput[]; organizationId: string }> {
  return groups.map((g, i) => ({
    name: g.name,
    sortOrder: i,
    options: g.options,
    organizationId,
  }))
}
