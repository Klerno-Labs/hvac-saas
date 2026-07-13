import { z } from 'zod'

export const createPriceBookItemSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  category: z.string().max(100).optional().or(z.literal('')),
  description: z.string().max(2000).optional().or(z.literal('')),
  flatPriceCents: z.coerce.number().int().min(0, 'Price must be 0 or more'),
  costCents: z.coerce.number().int().min(0, 'Cost must be 0 or more').optional(),
  imageUrl: z.string().max(1000).optional().or(z.literal('')),
})

export type CreatePriceBookItemInput = z.infer<typeof createPriceBookItemSchema>
