import { z } from 'zod'

export const assignJobSchema = z.object({
  jobId: z.string().min(1, 'Job ID is required'),
  technicianId: z.string().nullable(),
  scheduledFor: z.string().datetime().nullable(),
})

export type AssignJobInput = z.infer<typeof assignJobSchema>
