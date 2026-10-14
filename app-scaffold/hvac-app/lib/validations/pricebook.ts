import { z } from 'zod'
import { documentCentsSchema } from './document'

export const createPriceBookItemSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(200),
  category: z.string().max(100).optional().or(z.literal('')),
  description: z.string().max(2000).optional().or(z.literal('')),
  flatPriceCents: documentCentsSchema,
  costCents: documentCentsSchema.optional(),
  imageUrl: z.string().max(1000).optional().or(z.literal('')),
})

export type CreatePriceBookItemInput = z.infer<typeof createPriceBookItemSchema>
