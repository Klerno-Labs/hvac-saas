import { z } from 'zod'

export const enrollMembershipSchema = z.object({
  customerId: z.string().min(1, 'Customer is required'),
  planName: z.string().min(1, 'Plan name is required').max(100),
  recurringJobId: z.string().optional(),
})

export type EnrollMembershipInput = z.infer<typeof enrollMembershipSchema>
