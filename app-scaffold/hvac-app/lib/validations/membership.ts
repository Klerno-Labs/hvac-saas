import { z } from 'zod'

export const MEMBERSHIP_CADENCES = ['monthly', 'quarterly', 'biannual', 'annual'] as const
export type MembershipCadence = (typeof MEMBERSHIP_CADENCES)[number]

export const createMembershipPlanSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  description: z.string().max(1000).optional().or(z.literal('')),
  cadence: z.enum(MEMBERSHIP_CADENCES, { errorMap: () => ({ message: 'Invalid cadence' }) }),
  visitsPerYear: z.coerce.number().int().min(1, 'At least 1 visit required').max(365),
  price: z.coerce.number().min(0, 'Price must be non-negative'),
})

export const enrollMembershipSchema = z.object({
  planId: z.string().min(1, 'Plan is required'),
  customerId: z.string().min(1, 'Customer is required'),
  startDate: z.string().min(1, 'Start date is required'),
  equipmentIds: z.array(z.string()).default([]),
})

export type CreateMembershipPlanInput = z.infer<typeof createMembershipPlanSchema>
export type EnrollMembershipInput = z.infer<typeof enrollMembershipSchema>
