'use server'

import { db } from '@/lib/db'
import { trackEvent } from '@/lib/events'
import { logAudit } from '@/lib/audit'
import { requireAdmin } from '@/lib/require-admin'
import { updateCollectionsPolicySchema } from '@/lib/validations/collections'
import { requirePlan } from '@/lib/billing'

type ActionResult =
  | { success: true }
  | { success: false; error: string }

export async function updateCollectionsPolicy(input: {
  collectionsEnabled: boolean
  collectionsOverdue1Days: number
  collectionsOverdue2Days: number
  collectionsFinalDays: number
  smsEnabled?: boolean
}): Promise<ActionResult> {
  const adminResult = await requireAdmin()
  if (!adminResult.authorized) {
    return { success: false, error: adminResult.error }
  }

  const { userId, organizationId } = adminResult.context

  const org = await db.organization.findUnique({ where: { id: organizationId } })
  if (!org) {
    return { success: false, error: 'Organization not found' }
  }
  
  requirePlan(org, 'pro')

  const parsed = updateCollectionsPolicySchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0].message }
  }

  const data = parsed.data

  await db.organization.update({
    where: { id: organizationId },
    data: {
      collectionsEnabled: data.collectionsEnabled,
      collectionsOverdue1Days: data.collectionsOverdue1Days,
      collectionsOverdue2Days: data.collectionsOverdue2Days,
      collectionsFinalDays: data.collectionsFinalDays,
      ...(data.smsEnabled !== undefined && { smsEnabled: data.smsEnabled }),
    },
  })

  await trackEvent({
    organizationId,
    userId,
    eventName: 'collections_policy_updated',
    entityType: 'organization',
    entityId: organizationId,
    metadataJson: { enabled: data.collectionsEnabled },
  })

  await logAudit({
    organizationId,
    actorId: userId,
    eventType: 'collections_policy_changed',
    targetType: 'organization',
    targetId: organizationId,
    metadata: {
      enabled: data.collectionsEnabled,
      overdue1Days: data.collectionsOverdue1Days,
      overdue2Days: data.collectionsOverdue2Days,
      finalDays: data.collectionsFinalDays,
    },
  })

  return { success: true }
}
