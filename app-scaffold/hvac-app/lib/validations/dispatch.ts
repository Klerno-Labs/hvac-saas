import { z } from 'zod'

export const assignJobSchema = z.object({
  jobId: z.string().min(1, 'Job is required'),
  technicianId: z.string().min(1, 'Technician is required'),
  scheduledFor: z.string().datetime({ message: 'Invalid scheduled time' }),
})

export const createTechnicianSchema = z.object({
  name: z
    .string()
    .min(1, 'Name is required')
    .max(100, 'Name is too long')
    .transform((s) => s.trim()),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Invalid color')
    .optional()
    .or(z.literal('')),
})

export const updateTechnicianSchema = z.object({
  name: z
    .string()
    .min(1, 'Name is required')
    .max(100, 'Name is too long')
    .optional()
    .transform((s) => (s ? s.trim() : s)),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Invalid color')
    .optional()
    .or(z.literal('')),
  active: z.boolean().optional(),
})

export type AssignJobInput = z.infer<typeof assignJobSchema>
export type CreateTechnicianInput = z.infer<typeof createTechnicianSchema>
export type UpdateTechnicianInput = z.infer<typeof updateTechnicianSchema>
