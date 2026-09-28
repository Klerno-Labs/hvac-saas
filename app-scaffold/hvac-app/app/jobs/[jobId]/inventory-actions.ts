'use server'

import { requireMutationAccess, jobAccessWhere } from '@/lib/mutation-access'
import { db } from '@/lib/db'
import { trackEvent } from '@/lib/events'
import { recordInventoryUsageSchema } from '@/lib/validations/inventory'

type ActionResult = { success: true } | { success: false; error: string }

export async function recordPartUsage(
  jobId: string,
  formData: FormData
): Promise<ActionResult> {
  const access = await requireMutationAccess('fieldWork')
  if (!access.authorized) return { success: false, error: access.error }
  const { session, userId, organizationId } = access.context

  // Verify job belongs to org
  const job = await db.job.findFirst({
    where: { id: jobId, ...jobAccessWhere(access.context) },
  })
  if (!job) return { success: false, error: 'Job not found' }

  const raw = {
    inventoryItemId: formData.get('inventoryItemId'),
    quantity: formData.get('quantity'),
    notes: formData.get('notes') || undefined,
  }

  const parsed = recordInventoryUsageSchema.safeParse(raw)
  if (!parsed.success) return { success: false, error: parsed.error.errors[0].message }

  const data = parsed.data

  const recorded = await db.$transaction(async (tx) => {
    const stock = await tx.inventoryItem.updateMany({
      where: { id: data.inventoryItemId, organizationId, quantityOnHand: { gte: data.quantity } },
      data: { quantityOnHand: { decrement: data.quantity } },
    })
    if (stock.count !== 1) return false
    await tx.inventoryUsage.create({
      data: { organizationId, inventoryItemId: data.inventoryItemId, jobId,
        quantity: data.quantity, notes: data.notes || null },
    })
    return true
  })
  if (!recorded) return { success: false, error: 'Item is unavailable or has insufficient stock. Refresh and try again.' }

  await trackEvent({
    organizationId,
    userId: session.user.id,
    eventName: 'inventory_usage_recorded',
    entityType: 'job',
    entityId: jobId,
    metadataJson: {
      inventoryItemId: data.inventoryItemId,
      quantity: data.quantity,
    },
  })

  return { success: true }
}
