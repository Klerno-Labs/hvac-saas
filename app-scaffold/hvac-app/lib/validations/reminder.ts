import { documentDateSchema } from './document'
import { z } from 'zod'

export const REMINDER_STATUSES = ['open', 'completed', 'dismissed'] as const
export type ReminderStatus = (typeof REMINDER_STATUSES)[number]

export const REMINDER_TYPES = [
  'general',
  'follow_up_estimate',
  'follow_up_invoice',
  'call_customer',
  'review_job',
] as const

export const createReminderSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  notes: z.string().max(2000).optional().or(z.literal('')),
  reminderType: z.enum(REMINDER_TYPES).default('general'),
  dueAt: documentDateSchema,
  invoiceId: z.string().optional().or(z.literal('')),
  jobId: z.string().optional().or(z.literal('')),
  customerId: z.string().optional().or(z.literal('')),
  estimateId: z.string().optional().or(z.literal('')),
})

export const updateReminderStatusSchema = z.object({
  status: z.enum(REMINDER_STATUSES, { errorMap: () => ({ message: 'Invalid reminder status' }) }),
})

export type CreateReminderInput = z.infer<typeof createReminderSchema>
