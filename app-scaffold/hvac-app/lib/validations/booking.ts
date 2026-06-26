import { z } from 'zod'

export const SERVICE_TYPES = [
  'AC Repair',
  'AC Tune-Up / Maintenance',
  'Heating Repair',
  'Heating Tune-Up / Maintenance',
  'New System Installation',
  'System Inspection',
  'Duct Cleaning',
  'Indoor Air Quality',
  'Other',
] as const

export const PREFERRED_WINDOWS = [
  'As soon as possible',
  'Weekday mornings (8am–12pm)',
  'Weekday afternoons (12pm–5pm)',
  'Weekends',
  'Flexible',
] as const

export const createBookingRequestSchema = z.object({
  serviceType: z.string().min(1, 'Service type is required').max(100),
  preferredWindow: z.string().min(1, 'Preferred time window is required').max(100),
  contactName: z.string().min(1, 'Name is required').max(100),
  contactPhone: z.string().min(1, 'Phone number is required').max(30),
  contactEmail: z.string().email('Invalid email').optional().or(z.literal('')),
  address: z.string().max(300).optional().or(z.literal('')),
  notes: z.string().max(2000).optional().or(z.literal('')),
})

export type CreateBookingRequestInput = z.infer<typeof createBookingRequestSchema>
