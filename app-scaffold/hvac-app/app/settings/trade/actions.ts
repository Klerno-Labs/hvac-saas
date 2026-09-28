'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/require-admin'
import { updateTradeSchema } from '@/lib/validations/trade'
import { trackEvent } from '@/lib/events'
import { logAudit } from '@/lib/audit'

type TradeResult = { success: true } | { success: false; error: string }

export async function updateOrganizationTrade(input: unknown): Promise<TradeResult> {
  const admin = await requireAdmin()
  if (!admin.authorized) return { success: false, error: admin.error }

  const parsed = updateTradeSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.errors[0].message }

  const { organizationId, userId, userEmail } = admin.context
  const { tradeType } = parsed.data

  try {
    // Keep the setting and both records atomic: a successful result always has
    // an audit trail, and a failed result never leaves a partially saved change.
    await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Organization" WHERE id = ${organizationId} FOR UPDATE`
      const previous = await tx.organization.findUniqueOrThrow({
        where: { id: organizationId },
        select: { tradeType: true },
      })
      if (previous.tradeType === tradeType) return

      await tx.organization.update({ where: { id: organizationId }, data: { tradeType } })
      await logAudit({
        organizationId,
        actorId: userId,
        actorEmail: userEmail ?? undefined,
        eventType: 'organization_trade_changed',
        targetType: 'organization',
        targetId: organizationId,
        metadata: { from: previous.tradeType, to: tradeType },
      }, tx)
      await trackEvent({
        organizationId,
        userId,
        eventName: 'organization_trade_updated',
        entityType: 'organization',
        entityId: organizationId,
        metadataJson: { tradeType },
      }, tx)
    })
  } catch (error) {
    console.error('Could not update organization trade:', error)
    return { success: false, error: 'Your trade could not be saved. Please try again.' }
  }

  revalidatePath('/', 'layout')
  return { success: true }
}
