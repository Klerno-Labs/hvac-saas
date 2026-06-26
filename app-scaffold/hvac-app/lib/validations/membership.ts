import { z } from 'zod'
import { RECURRING_FREQUENCIES } from './recurring-job'

export const MEMBERSHIP_CADENCES = RECURRING_FREQUENCIES

export const createMembershipPlanSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  description: z.string().max(2000).optional().or(z.literal('')),
  cadence: z.enum(MEMBERSHIP_CADENCES, {
    errorMap: () => ({ message: 'Invalid cadence' }),
  }),
  visitsPerYear: z.coerce.number().int().min(1).max(52),
  priceCents: z.coerce.number().int().min(0),
})

export type CreateMembershipPlanInput = z.infer<typeof createMembershipPlanSchema>

export const enrollMembershipSchema = z.object({
  planId: z.string().min(1, 'Plan is required'),
  customerId: z.string().min(1, 'Customer is required'),
  startDate: z.string().min(1, 'Start date is required'),
  equipmentIds: z.array(z.string()).optional().default([]),
})

export type EnrollMembershipInput = z.infer<typeof enrollMembershipSchema>
