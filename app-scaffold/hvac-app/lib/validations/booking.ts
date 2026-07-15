import { z } from 'zod'

export const LEAD_SOURCES = ['web', 'referral', 'google', 'phone', 'repeat', 'other'] as const
export type LeadSource = (typeof LEAD_SOURCES)[number]

export const createBookingRequestSchema = z.object({
  serviceType: z.string().min(1, 'Service type is required').max(120),
  preferredWindow: z.string().min(1, 'Preferred time window is required').max(120),
  contactName: z.string().min(1, 'Name is required').max(120),
  contactEmail: z.string().email('Invalid email').optional().or(z.literal('')),
  contactPhone: z.string().min(1, 'Phone number is required').max(30),
  address: z.string().max(300).optional().or(z.literal('')),
  notes: z.string().max(2000).optional().or(z.literal('')),
})

export type CreateBookingRequestInput = z.infer<typeof createBookingRequestSchema>

export const confirmBookingSchema = z.object({
  leadSource: z.enum(LEAD_SOURCES).optional(),
})
