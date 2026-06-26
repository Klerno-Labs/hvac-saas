import { z } from 'zod'

export const enrollMembershipSchema = z.object({
  customerId: z.string().min(1),
  recurringJobId: z.string().min(1).optional(),
})

export type EnrollMembershipInput = z.infer<typeof enrollMembershipSchema>
