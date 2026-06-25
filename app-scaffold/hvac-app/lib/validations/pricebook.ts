import { z } from 'zod'

const optionGroupSchema = z.object({
  tier: z.enum(['good', 'better', 'best']),
  name: z.string().min(1, 'Option name is required').max(200),
  description: z.string().max(2000).optional().or(z.literal('')),
  priceCents: z.coerce.number().int().min(0),
  sortOrder: z.coerce.number().int().min(0).default(0),
})

export const createPriceBookItemSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  category: z.string().max(100).optional().or(z.literal('')),
  description: z.string().max(2000).optional().or(z.literal('')),
  flatPriceCents: z.coerce.number().int().min(0),
  costCents: z.coerce.number().int().min(0).optional(),
  imageUrl: z.string().url().optional().or(z.literal('')),
  optionGroups: z.array(optionGroupSchema).default([]),
})

export type CreatePriceBookItemInput = z.infer<typeof createPriceBookItemSchema>

export const updatePriceBookItemSchema = createPriceBookItemSchema

export type UpdatePriceBookItemInput = z.infer<typeof updatePriceBookItemSchema>
