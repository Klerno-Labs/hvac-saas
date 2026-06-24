import { z } from 'zod'

export const OPTION_TIERS = ['good', 'better', 'best'] as const
export type OptionTier = (typeof OPTION_TIERS)[number]

export const TIER_LABELS: Record<OptionTier, string> = {
  good: 'Good',
  better: 'Better',
  best: 'Best',
}

export const createPriceBookItemSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  category: z.string().max(100).optional().or(z.literal('')),
  description: z.string().max(2000).optional().or(z.literal('')),
  flatPriceCents: z.coerce.number().int().min(0, 'Flat price must be 0 or more'),
  costCents: z.coerce.number().int().min(0, 'Cost must be 0 or more').optional(),
  imageUrl: z.string().max(2000).optional().or(z.literal('')),
})

export type CreatePriceBookItemInput = z.infer<typeof createPriceBookItemSchema>

export const updatePriceBookItemSchema = createPriceBookItemSchema
export type UpdatePriceBookItemInput = z.infer<typeof updatePriceBookItemSchema>

const optionSchema = z.object({
  tier: z.enum(OPTION_TIERS, { errorMap: () => ({ message: 'Tier must be good, better, or best' }) }),
  name: z.string().min(1, 'Option name is required').max(200),
  description: z.string().max(2000).optional().or(z.literal('')),
  priceCents: z.coerce.number().int().min(0, 'Price must be 0 or more'),
  costCents: z.coerce.number().int().min(0, 'Cost must be 0 or more').optional(),
  imageUrl: z.string().max(2000).optional().or(z.literal('')),
})

export const createOptionGroupSchema = z.object({
  name: z.string().min(1, 'Group name is required').max(200),
  category: z.string().max(100).optional().or(z.literal('')),
  description: z.string().max(2000).optional().or(z.literal('')),
  options: z.array(optionSchema).min(1, 'At least one tier is required'),
})

export type CreateOptionGroupInput = z.infer<typeof createOptionGroupSchema>
export type OptionGroupOptionInput = z.infer<typeof optionSchema>

export const updateOptionGroupSchema = createOptionGroupSchema
export type UpdateOptionGroupInput = z.infer<typeof updateOptionGroupSchema>
