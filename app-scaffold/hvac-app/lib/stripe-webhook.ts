import type Stripe from 'stripe'
import { getStripe } from '@/lib/stripe'
import { getStripeRuntimeAvailability } from '@/lib/stripe-runtime'

type WebhookScope = 'platform' | 'connect'
type VerificationResult =
  | { verified: true; event: Stripe.Event; scope: WebhookScope; modeMatches: boolean }
  | { verified: false; error: string; status: 400 | 503 }

/** Each Stripe destination has its own signing secret, even when URLs match.
 * Bind a verified signature to its configured account scope before using data. */
export function verifyStripeWebhook(
  body: string,
  signature: string | null,
  allowedScopes: readonly WebhookScope[],
): VerificationResult {
  if (!signature) return { verified: false, error: 'Missing webhook signature', status: 400 }

  const runtime = getStripeRuntimeAvailability()
  if (!runtime.available) return { verified: false, error: 'Stripe payment configuration is unavailable', status: 503 }
  const keyMode = runtime.mode

  const secrets = {
    platform: process.env.STRIPE_WEBHOOK_SECRET?.trim(),
    connect: process.env.STRIPE_CONNECT_WEBHOOK_SECRET?.trim(),
  }
  if (secrets.platform && secrets.platform === secrets.connect) {
    return { verified: false, error: 'Webhook destinations require distinct signing secrets', status: 503 }
  }
  if (!allowedScopes.some(scope => secrets[scope])) {
    return { verified: false, error: 'Missing webhook configuration', status: 503 }
  }

  for (const scope of allowedScopes) {
    const secret = secrets[scope]
    if (!secret) continue
    let event: Stripe.Event
    try {
      event = getStripe().webhooks.constructEvent(body, signature, secret)
    } catch {
      // Never log signature errors: provider errors can include the raw payload.
      continue
    }
    const connected = typeof event.account === 'string' && event.account.startsWith('acct_')
    if ((scope === 'connect' && !connected) || (scope === 'platform' && event.account != null)) {
      return { verified: false, error: 'Webhook account scope mismatch', status: 400 }
    }
    if (typeof event.livemode !== 'boolean') {
      return { verified: false, error: 'Missing webhook mode', status: 400 }
    }
    // Production Connect destinations receive both live and test events. Safely
    // acknowledge the other mode without reading or changing application data.
    return { verified: true, event, scope, modeMatches: event.livemode === (keyMode === 'live') }
  }
  return { verified: false, error: 'Invalid webhook signature', status: 400 }
}

export function isPlatformBillingEvent(type: string): boolean {
  return [
    'customer.subscription.created',
    'customer.subscription.updated',
    'customer.subscription.deleted',
    'invoice.payment_failed',
    'invoice.payment_succeeded',
  ].includes(type)
}
