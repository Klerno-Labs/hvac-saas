import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { createHash } from 'node:crypto'
import Stripe from 'stripe'
import { getStripe } from '@/lib/stripe'
import { trackEvent } from '@/lib/events'
import { dispatchStripeEvent } from '@/lib/stripe-webhook-handlers'
import {
  recordInboundEvent,
  attemptDispatch,
} from '@/lib/stripe-webhook-replay'

export async function POST(req: Request) {
  const body = await req.text()
  const headersList = await headers()
  const signature = headersList.get('stripe-signature')

  if (!signature || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Missing webhook configuration' }, { status: 400 })
  }

  let event: Stripe.Event

  try {
    event = getStripe().webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET)
  } catch (error) {
    console.error('Webhook signature verification failed:', error)
    return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 400 })
  }

  // Idempotently persist the inbound event (signature already verified).
  // Persistence is best-effort: a DB outage here must not change the happy
  // path, so on failure we still dispatch — we just skip retry tracking.
  let runHandler = true
  let persisted = false
  try {
    const payloadHash = createHash('sha256').update(body).digest('hex')
    const inbound = await recordInboundEvent(event.id, event.type, payloadHash)
    runHandler = inbound.runHandler
    persisted = true
  } catch (error) {
    console.error('Failed to persist webhook event (continuing best-effort):', error)
  }

  // Already seen this event id (Stripe redelivery / concurrent duplicate).
  // Do not re-run the handler — the scheduler drives any scheduled retries.
  if (!runHandler) {
    return NextResponse.json({ received: true })
  }

  try {
    let succeeded: boolean
    if (persisted) {
      const outcome = await attemptDispatch(event.id, event)
      succeeded = outcome === 'succeeded'
    } else {
      // Persistence layer unavailable — dispatch directly, skip retry state.
      await dispatchStripeEvent(event)
      succeeded = true
    }

    if (succeeded) {
      await trackEvent({
        eventName: 'webhook_processed',
        metadataJson: { eventType: event.type, eventId: event.id },
      })
      return NextResponse.json({ received: true })
    }

    // Handler failed; event is now `retry_scheduled` or `dead_lettered`.
    // Preserve the original 500 response so Stripe's own redelivery also feeds
    // the same idempotent gate.
    console.error(`Webhook processing error for ${event.type} (${event.id}): retry scheduled or dead-lettered`)
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
  } catch (error) {
    console.error(`Webhook processing error for ${event.type}:`, error)
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
  }
}
