'use server'

import { requireMutationAccess } from '@/lib/mutation-access'
import { db } from '@/lib/db'
import { trackEvent } from '@/lib/events'
import { updateInventoryItemSchema } from '@/lib/validations/inventory'

type ActionResult = { success: true } | { success: false; error: string }

export async function updateInventoryItem(
  itemId: string,
  formData: FormData
): Promise<ActionResult> {
  const access = await requireMutationAccess('manageInventory')
  if (!access.authorized) return { success: false, error: access.error }
  const { session, membership, userId, organizationId } = access.context

  const item = await db.inventoryItem.findFirst({
    where: { id: itemId, organizationId: membership.organizationId },
  })
  if (!item) return { success: false, error: 'Item not found' }

  const raw = {
    name: formData.get('name'),
    sku: formData.get('sku') || undefined,
    description: formData.get('description') || undefined,
    unitCostCents: Math.round(Number(formData.get('unitCost') || '0') * 100),
    sellPriceCents: Math.round(Number(formData.get('sellPrice') || '0') * 100),
    quantityOnHand: Number(formData.get('quantityOnHand') || '0'),
    reorderPoint: Number(formData.get('reorderPoint') || '0'),
    category: formData.get('category') || undefined,
  }

  const parsed = updateInventoryItemSchema.safeParse(raw)
  if (!parsed.success) return { success: false, error: parsed.error.errors[0].message }

  const data = parsed.data
  await db.inventoryItem.update({
    where: { id: itemId },
    data: {
      name: data.name,
      sku: data.sku || null,
      description: data.description || null,
      unitCostCents: data.unitCostCents,
      sellPriceCents: data.sellPriceCents,
      quantityOnHand: data.quantityOnHand,
      reorderPoint: data.reorderPoint,
      category: data.category || null,
    },
  })

  await trackEvent({
    organizationId: membership.organizationId,
    userId: session.user.id,
    eventName: 'inventory_item_updated',
    entityType: 'inventory_item',
    entityId: itemId,
  })

  return { success: true }
}
