import { z } from 'zod'

const configurationId = z.string().max(100).regex(/^bpc_[A-Za-z0-9]+$/)

/** Select this application's portal without changing a shared Stripe account's default. */
export function billingPortalConfigurationId(): string | undefined {
  const value = process.env.STRIPE_BILLING_PORTAL_CONFIGURATION_ID?.trim()
  if (!value) return undefined
  if (!configurationId.safeParse(value).success) {
    // Do not reflect environment values: an operator may have pasted a credential.
    throw new Error('Billing portal configuration is invalid')
  }
  return value
}
