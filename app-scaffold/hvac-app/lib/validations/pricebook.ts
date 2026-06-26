import { z } from 'zod'

export const PRICE_BOOK_TIERS = ['good', 'better', 'best'] as const
export type PriceBookTier = (typeof PRICE_BOOK_TIERS)[number]

const optionGroupSchema = z.object({
  tier: z.enum(PRICE_BOOK_TIERS),
  name: z.string().min(1, 'Option name is required').max(200),
  description: z.string().max(500).optional().or(z.literal('')),
  priceCents: z.coerce.number().int().min(0, 'Price must be 0 or more'),
})

export const createPriceBookItemSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  category: z.string().max(100).optional().or(z.literal('')),
  description: z.string().max(2000).optional().or(z.literal('')),
  flatPriceCents: z.coerce.number().int().min(0, 'Flat price must be 0 or more'),
  costCents: z.coerce.number().int().min(0, 'Cost must be 0 or more').optional(),
  imageUrl: z.string().max(1000).url().optional().or(z.literal('')),
  optionGroups: z.array(optionGroupSchema).default([]),
})

export type CreatePriceBookItemInput = z.infer<typeof createPriceBookItemSchema>

export const updatePriceBookItemSchema = createPriceBookItemSchema

export type UpdatePriceBookItemInput = z.infer<typeof updatePriceBookItemSchema>
