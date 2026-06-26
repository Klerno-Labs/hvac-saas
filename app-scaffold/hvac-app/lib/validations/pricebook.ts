import { z } from 'zod'

const priceBookOptionGroupInputSchema = z.object({
  tier: z.enum(['good', 'better', 'best']),
  name: z.string().min(1, 'Option name is required').max(200),
  description: z.string().max(2000).optional().or(z.literal('')),
  priceCents: z.number().int().min(0, 'Price must be 0 or more'),
  sortOrder: z.number().int().min(0).optional(),
})

export const createPriceBookItemSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  category: z.string().max(100).optional().or(z.literal('')),
  description: z.string().max(2000).optional().or(z.literal('')),
  flatPriceCents: z.number().int().min(0, 'Price must be 0 or more'),
  costCents: z.number().int().min(0).optional(),
  imageUrl: z.string().url('Invalid image URL').optional().or(z.literal('')),
  optionGroups: z.array(priceBookOptionGroupInputSchema).optional(),
})

export type CreatePriceBookItemInput = z.infer<typeof createPriceBookItemSchema>

export const updatePriceBookItemSchema = createPriceBookItemSchema
export type UpdatePriceBookItemInput = z.infer<typeof updatePriceBookItemSchema>
