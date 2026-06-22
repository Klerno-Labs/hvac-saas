import { z } from 'zod'

export const TECHNICIAN_ROLES = ['technician', 'lead', 'helper', 'apprentice'] as const
export type TechnicianRole = (typeof TECHNICIAN_ROLES)[number]

export const createTechnicianSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  phone: z.string().max(30).optional().or(z.literal('')),
  role: z.enum(TECHNICIAN_ROLES, { errorMap: () => ({ message: 'Invalid role' }) }).default('technician'),
  skills: z.array(z.string().max(50)).default([]),
  active: z.boolean().default(true),
  userId: z.string().min(1).optional().or(z.literal('')),
})

export const updateTechnicianSchema = createTechnicianSchema.partial()

export type CreateTechnicianInput = z.infer<typeof createTechnicianSchema>
export type UpdateTechnicianInput = z.infer<typeof updateTechnicianSchema>
