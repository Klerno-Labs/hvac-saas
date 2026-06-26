import { z } from 'zod'

export const createBookingRequestSchema = z.object({
  serviceType: z.string().min(1, 'Service type is required'),
  preferredWindow: z.string().min(1, 'Preferred time is required'),
  contactName: z.string().min(1, 'Name is required'),
  contactPhone: z.string().min(7, 'Phone number is required'),
  contactEmail: z.string().email().optional(),
  address: z.string().optional(),
  notes: z.string().max(2000).optional(),
})

export type CreateBookingRequest = z.infer<typeof createBookingRequestSchema>
