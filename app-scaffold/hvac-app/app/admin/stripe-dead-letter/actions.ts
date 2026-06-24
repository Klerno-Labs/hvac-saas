'use server'

import { revalidatePath } from 'next/cache'
import { requirePlatformAdmin } from '@/lib/require-platform-admin'
import { replayDeadLetteredEvent } from '@/lib/stripe-webhook-replay'
import { trackEvent } from '@/lib/events'

/**
 * Operator-initiated replay of a dead-lettered Stripe webhook event. Re-arms
 * the event with a fresh retry budget; the next scheduler tick re-fetches and
 * re-dispatches it. Platform-admin gated — the event may belong to any tenant.
 */
export async function replayEventAction(eventId: string): Promise<{ ok: boolean; error?: string }> {
  const admin = await requirePlatformAdmin()
  if (!admin.authorized) {
    return { ok: false, error: admin.error }
  }

  const result = await replayDeadLetteredEvent(eventId)
  if (!result.ok) {
    const error =
      result.reason === 'not_found'
        ? 'Event not found'
        : 'Only dead-lettered events can be replayed'
    return { ok: false, error }
  }

  await trackEvent({
    eventName: 'stripe_webhook_replayed',
    metadataJson: { eventId, replayedBy: admin.email },
  })

  revalidatePath('/admin/stripe-dead-letter')
  return { ok: true }
}
