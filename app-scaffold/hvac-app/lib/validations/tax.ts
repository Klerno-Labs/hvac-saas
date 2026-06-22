import { z } from 'zod'
import { MAX_TAX_RATE_BPS } from '@/lib/tax'

/**
 * Org-level default sales-tax rate, in basis points.
 * 0 means no tax is applied by default (the safe default for existing orgs).
 */
export const updateTaxSettingsSchema = z.object({
  defaultTaxRateBps: z
    .number()
    .int()
    .min(0, 'Tax rate cannot be negative')
    .max(MAX_TAX_RATE_BPS, 'Tax rate is unreasonably high'),
})

export type UpdateTaxSettingsInput = z.infer<typeof updateTaxSettingsSchema>
