import { z } from 'zod'
import { tradeTypeSchema } from './trade'

export const createOrganizationSchema = z.object({
  name: z.string().min(1, 'Business name is required').max(200),
  tradeType: tradeTypeSchema.default('hvac'),
  phone: z.string().optional(),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  timezone: z.string().optional(),
})

export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>
