import Stripe from 'stripe'
import { getStripeRuntimeAvailability } from '@/lib/stripe-runtime'

let _stripe: Stripe | null = null
let _stripeKey: string | undefined

export function getStripe(): Stripe {
  // Check every call, before cached-client reuse. Production must never fall
  // back to sandbox operations, even if a test client was initialized earlier.
  if (!getStripeRuntimeAvailability().available) {
    throw new Error('Online payments are unavailable. Please review payment setup before trying again.')
  }
  const key = process.env.STRIPE_SECRET_KEY!.trim()
  if (!_stripe || _stripeKey !== key) {
    _stripe = new Stripe(key, {
      apiVersion: '2025-02-24.acacia',
    })
    _stripeKey = key
  }
  return _stripe
}
