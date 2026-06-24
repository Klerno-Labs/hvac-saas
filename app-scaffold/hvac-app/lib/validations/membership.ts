import { z } from 'zod'
import { RECURRING_FREQUENCIES } from '@/lib/validations/recurring-job'

export const MEMBERSHIP_STATUSES = ['active', 'paused', 'cancelled', 'expired'] as const
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number]

export const MEMBERSHIP_STATUS_LABELS: Record<MembershipStatus, string> = {
  active: 'Active',
  paused: 'Paused',
  cancelled: 'Cancelled',
  expired: 'Expired',
}

export const MEMBERSHIP_VISIT_FREQUENCIES = RECURRING_FREQUENCIES
export type MembershipVisitFrequency = (typeof MEMBERSHIP_VISIT_FREQUENCIES)[number]

export const VISIT_FREQUENCY_LABELS: Record<MembershipVisitFrequency, string> = {
  monthly: 'Monthly',
  quarterly: 'Quarterly (every 3 months)',
  biannual: 'Biannual (every 6 months)',
  annual: 'Annual (every 12 months)',
}

const optionalString = (max: number) =>
  z.string().max(max).optional().or(z.literal('')).transform((v) => v || undefined)

const positiveInt = z
  .number({ invalid_type_error: 'Must be a number' })
  .int('Must be a whole number')
  .min(1, 'Must be at least 1')

export const createMembershipPlanSchema = z.object({
  name: z.string().min(1, 'Name is required').max(120),
  description: optionalString(2000),
  termMonths: z
    .number({ invalid_type_error: 'Must be a number' })
    .int('Must be a whole number')
    .min(1, 'Term must be at least 1 month')
    .max(60, 'Term cannot exceed 60 months'),
  visitFrequency: z.enum(MEMBERSHIP_VISIT_FREQUENCIES, {
    errorMap: () => ({ message: 'Pick a visit cadence' }),
  }),
  includedVisitsPerTerm: positiveInt.max(52, 'Cannot exceed 52 visits per term'),
  priceCents: z
    .number({ invalid_type_error: 'Must be a number' })
    .int('Must be a whole number')
    .min(0, 'Price cannot be negative')
    .max(1_000_000_00, 'Price is unrealistically high'),
})

export const updateMembershipPlanSchema = createMembershipPlanSchema.partial().extend({
  isActive: z.boolean().optional(),
})

export const createMembershipEnrollmentSchema = z.object({
  customerId: z.string().min(1, 'Customer is required'),
  planId: z.string().min(1, 'Plan is required'),
  // ISO date string (yyyy-mm-dd) for the day the first term begins.
  effectiveDate: z.string().min(1, 'Effective date is required'),
  notes: optionalString(2000),
  // Optional list of equipment (belonging to the customer) to cover up front.
  equipmentIds: z.array(z.string().min(1)).default([]),
})

export type CreateMembershipPlanInput = z.infer<typeof createMembershipPlanSchema>
export type UpdateMembershipPlanInput = z.infer<typeof updateMembershipPlanSchema>
export type CreateMembershipEnrollmentInput = z.infer<typeof createMembershipEnrollmentSchema>
