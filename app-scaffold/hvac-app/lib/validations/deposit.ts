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
      if (!data.depositType) return false
      if (data.depositType === 'percent') return data.depositPercent != null && data.depositPercent > 0
      if (data.depositType === 'fixed') return data.depositFixedCents != null && data.depositFixedCents > 0
      return false
    },
    {
      message: 'When deposit is required, a type and its matching value (> 0) must be provided',
    },
  )

export type DepositConfigInput = z.infer<typeof depositConfigSchema>
