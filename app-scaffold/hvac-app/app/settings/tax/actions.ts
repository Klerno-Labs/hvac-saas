'use server'

import { db } from '@/lib/db'
import { trackEvent } from '@/lib/events'
import { logAudit } from '@/lib/audit'
import { requireAdmin } from '@/lib/require-admin'
import { updateTaxSettingsSchema } from '@/lib/validations/tax'

type ActionResult =
  | { success: true }
  | { success: false; error: string }

export async function updateTaxSettings(input: {
  defaultTaxRateBps: number
}): Promise<ActionResult> {
  const adminResult = await requireAdmin()
  if (!adminResult.authorized) {
    return { success: false, error: adminResult.error }
  }

  const { userId, organizationId } = adminResult.context

  const parsed = updateTaxSettingsSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0].message }
  }

  const data = parsed.data

  await db.organization.update({
    where: { id: organizationId },
    data: { defaultTaxRateBps: data.defaultTaxRateBps },
  })

  await trackEvent({
    organizationId,
    userId,
    eventName: 'tax_settings_updated',
    entityType: 'organization',
    entityId: organizationId,
    metadataJson: { defaultTaxRateBps: data.defaultTaxRateBps },
  })

  await logAudit({
    organizationId,
    actorId: userId,
    eventType: 'tax_settings_changed',
    targetType: 'organization',
    targetId: organizationId,
    metadata: { defaultTaxRateBps: data.defaultTaxRateBps },
  })

  return { success: true }
}
