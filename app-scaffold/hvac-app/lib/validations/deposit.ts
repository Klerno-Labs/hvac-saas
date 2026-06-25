import { z } from 'zod'

export const depositConfigSchema = z
  .object({
    depositRequired: z.boolean(),
    depositType: z.enum(['percent', 'fixed']).nullable().optional(),
    depositPercent: z.number().min(0).max(100).nullable().optional(),
    depositFixedCents: z.number().int().min(0).nullable().optional(),
  })
  .refine(
    (data) => {
      if (!data.depositRequired) return true
      if (data.depositType === 'percent') return (data.depositPercent ?? 0) > 0
      if (data.depositType === 'fixed') return (data.depositFixedCents ?? 0) > 0
      return false
    },
    { message: 'A deposit type and positive value are required when a deposit is required' },
  )

export type DepositConfigInput = z.infer<typeof depositConfigSchema>
