import { z } from 'zod'

export const JOB_STATUSES = ['draft', 'scheduled', 'in_progress', 'completed', 'cancelled'] as const
export type JobStatus = (typeof JOB_STATUSES)[number]

export const createJobSchema = z.object({
  customerId: z.string().min(1, 'Customer is required'),
  title: z.string().min(1, 'Job title is required').max(200),
  notes: z.string().max(2000).optional().or(z.literal('')),
  scheduledFor: z.string().optional().or(z.literal('')),
  technicianMemberId: z.string().optional().or(z.literal('')),
})

export const updateJobStatusSchema = z.object({
  status: z.enum(JOB_STATUSES, { errorMap: () => ({ message: 'Invalid job status' }) }),
})

export type CreateJobInput = z.infer<typeof createJobSchema>
