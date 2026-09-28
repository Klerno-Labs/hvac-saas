import { documentDateSchema } from './document'
import { z } from 'zod'

export const RECURRING_FREQUENCIES = ['monthly', 'quarterly', 'biannual', 'annual'] as const
export type RecurringFrequency = (typeof RECURRING_FREQUENCIES)[number]

export const createRecurringJobSchema = z.object({
  customerId: z.string().min(1, 'Customer is required'),
  title: z.string().min(1, 'Title is required').max(200),
  description: z.string().max(2000).optional().or(z.literal('')),
  frequency: z.enum(RECURRING_FREQUENCIES, {
    errorMap: () => ({ message: 'Invalid frequency' }),
  }),
  nextDueDate: documentDateSchema.refine((value): value is string => typeof value === 'string' && value.length > 0, 'Date is required'),
})

export type CreateRecurringJobInput = z.infer<typeof createRecurringJobSchema>
