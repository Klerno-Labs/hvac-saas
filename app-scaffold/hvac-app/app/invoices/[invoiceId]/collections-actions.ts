'use server'

import { requireMutationAccess } from '@/lib/mutation-access'
import { db } from '@/lib/db'
import { trackEvent } from '@/lib/events'
import { logAudit } from '@/lib/audit'
import { COLLECTION_ATTEMPT_STATUSES } from '@/lib/validations/collections'

type ActionResult =
  | { success: true }
  | { success: false; error: string }

export async function toggleCollectionsPause(invoiceId: string, pause: boolean): Promise<ActionResult> {
  const access = await requireMutationAccess('editPricing')
  if (!access.authorized) return { success: false, error: access.error }
  const { userId, organizationId } = access.context

  const invoice = await db.invoice.findFirst({
    where: { id: invoiceId, organizationId },
  })
  if (!invoice) {
    return { success: false, error: 'Invoice not found in your organization' }
  }

  await db.invoice.update({
    where: { id: invoiceId },
    data: { collectionsPaused: pause },
  })

  await trackEvent({
    organizationId,
    userId,
    eventName: pause ? 'collections_paused_for_invoice' : 'collections_resumed_for_invoice',
    entityType: 'invoice',
    entityId: invoiceId,
  })

  await logAudit({
    organizationId,
    actorId: userId,
    eventType: pause ? 'collections_pause_changed' : 'collections_pause_changed',
    targetType: 'invoice',
    targetId: invoiceId,
    metadata: { paused: pause },
  })

  return { success: true }
}

export async function dismissCollectionAttempt(attemptId: string): Promise<ActionResult> {
  const access = await requireMutationAccess('editPricing')
  if (!access.authorized) return { success: false, error: access.error }
  const { userId, organizationId } = access.context

  const attempt = await db.collectionAttempt.findFirst({
    where: { id: attemptId, organizationId },
  })
  if (!attempt) {
    return { success: false, error: 'Collection attempt not found' }
  }

  if (!COLLECTION_ATTEMPT_STATUSES.includes(attempt.status as typeof COLLECTION_ATTEMPT_STATUSES[number])) {
    return { success: false, error: 'Invalid attempt status' }
  }

  await db.collectionAttempt.update({
    where: { id: attemptId },
    data: { status: 'dismissed' },
  })

  await trackEvent({
    organizationId,
    userId,
    eventName: 'collections_attempt_dismissed',
    entityType: 'collection_attempt',
    entityId: attemptId,
  })

  return { success: true }
}
