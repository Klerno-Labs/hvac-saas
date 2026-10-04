import { z } from 'zod'
import { tradeTypeSchema } from './trade'
import { resolveBusinessTimeZone } from '@/lib/format'

export function isConfiguredBusinessTimezone(value: unknown): value is string {
  if (typeof value !== 'string' || !/^[A-Za-z]/.test(value)) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format()
    return true
  } catch { return false }
}

export const businessProfileSchema = z.object({
  name: z.string().trim().min(1, 'Enter your business name.').max(200),
  tradeType: tradeTypeSchema,
  timezone: z.string().trim().refine(isConfiguredBusinessTimezone, 'Choose a valid business timezone.').transform(resolveBusinessTimeZone),
  phone: z.string().trim().max(40, 'Phone number is too long.').optional().default(''),
  email: z.string().trim().max(254).email('Enter a valid business email.').or(z.literal('')).optional().default(''),
})

export type BusinessProfileInput = z.input<typeof businessProfileSchema>
