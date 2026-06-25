'use server'

import { requireAdmin } from '@/lib/require-admin'
import { getStripe } from '@/lib/stripe'
import { db } from '@/lib/db'
import { markReplayed, markFailed } from '@/lib/webhook-store'
import { dispatchEvent } from '@/app/api/stripe/webhook/route'
import { revalidatePath } from 'next/cache'

export async function replayWebhookEvent(formData: FormData): Promise<void> {
  const adminResult = await requireAdmin()
  if (!adminResult.authorized) return

  const webhookEventId = formData.get('webhookEventId')
  if (typeof webhookEventId !== 'string' || !webhookEventId) return

  const row = await db.webhookEvent.findUnique({ where: { id: webhookEventId } })
  if (!row || row.status !== 'dead_letter') return

  let event
  try {
    event = await getStripe().events.retrieve(row.stripeEventId)
  } catch (err) {
    await markFailed(webhookEventId, err)
    revalidatePath('/settings/webhooks')
    return
  }

  try {
    await dispatchEvent(event)
    await markReplayed(webhookEventId)
  } catch (err) {
    await markFailed(webhookEventId, err)
  }

  revalidatePath('/settings/webhooks')
}
