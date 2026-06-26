import { z } from 'zod'

export const createBookingRequestSchema = z.object({
  serviceType: z.string().min(1, 'Service type is required').max(200),
  preferredWindow: z.string().min(1, 'Preferred window is required').max(500),
  contactName: z.string().min(1, 'Name is required').max(200),
  contactEmail: z.string().email('Invalid email').optional().or(z.literal('')),
  contactPhone: z.string().min(1, 'Phone number is required').max(50),
  address: z.string().max(500).optional().or(z.literal('')),
  notes: z.string().max(2000).optional().or(z.literal('')),
})

export const confirmBookingSchema = z.object({
  leadSource: z.string().max(100).optional().default('web'),
})
