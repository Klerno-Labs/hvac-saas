import { z } from 'zod'
import { SERVICE_TYPES, TIME_WINDOWS } from '@/lib/lead-source'

/* -------------------------------------------------------------------------- */
/* Public booking form (unauthenticated)                                      */
/* -------------------------------------------------------------------------- */

/**
 * Honeypot field — must be present and empty. Bots tend to fill all fields;
 * any value here causes a silent rejection. Named to look like a real field
 * ("companyUrl") rather than `honeypot` so it is not filtered by bot scripts.
 */
export const bookingRequestSchema = z.object({
  slug: z.string().min(1),
  firstName: z.string().min(1, 'First name is required').max(100),
  lastName: z.string().max(100).optional().or(z.literal('')),
  companyName: z.string().max(200).optional().or(z.literal('')),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  // At least one contact channel is required; enforced at the action layer so
  // we can return a clearer message than Zod's per-field errors.
  phone: z.string().max(30).optional().or(z.literal('')),
  addressLine1: z.string().max(200).optional().or(z.literal('')),
  city: z.string().max(100).optional().or(z.literal('')),
  state: z.string().max(50).optional().or(z.literal('')),
  postalCode: z.string().max(20).optional().or(z.literal('')),
  serviceType: z.enum(SERVICE_TYPES, {
    errorMap: () => ({ message: 'Select a service type' }),
  }),
  preferredDate: z.string().optional().or(z.literal('')),
  preferredWindow: z.enum(TIME_WINDOWS).default('anytime'),
  description: z.string().max(2000).optional().or(z.literal('')),
  companyUrl: z.string().max(0).optional().or(z.literal('')), // honeypot
})

export type BookingRequestInput = z.infer<typeof bookingRequestSchema>

/* -------------------------------------------------------------------------- */
/* Office confirm / reject (authenticated)                                    */
/* -------------------------------------------------------------------------- */

export const confirmBookingSchema = z.object({
  requestId: z.string().min(1),
})

export const rejectBookingSchema = z.object({
  requestId: z.string().min(1),
  reason: z.string().max(500).optional().or(z.literal('')),
})

/* -------------------------------------------------------------------------- */
/* Booking settings (admin)                                                   */
/* -------------------------------------------------------------------------- */

export const bookingSettingsSchema = z.object({
  bookingEnabled: z.boolean(),
  publicSlug: z
    .string()
    .min(1, 'Slug is required when booking is enabled')
    .max(40)
    .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, 'Use lowercase letters, numbers, and hyphens'),
})
