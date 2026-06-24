'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { trackEvent } from '@/lib/events'
import { updatePriceBookItemSchema } from '@/lib/validations/price-book'

type ActionResult = { success: true } | { success: false; error: string }

export async function updatePriceBookItem(
  itemId: string,
  formData: FormData,
): Promise<ActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, error: 'You must be logged in' }

  const membership = await db.organizationMember.findFirst({
    where: { userId: session.user.id },
  })
  if (!membership) return { success: false, error: 'You must belong to an organization' }

  const item = await db.priceBookItem.findFirst({
    where: { id: itemId, organizationId: membership.organizationId },
  })
  if (!item) return { success: false, error: 'Item not found' }

  const raw = {
    name: formData.get('name'),
    category: formData.get('category') || undefined,
    description: formData.get('description') || undefined,
    flatPriceCents: Math.round(parseFloat(formData.get('flatPrice') as string || '0') * 100),
    costCents: formData.get('cost')
      ? Math.round(parseFloat(formData.get('cost') as string || '0') * 100)
      : undefined,
    imageUrl: formData.get('imageUrl') || undefined,
  }

  const parsed = updatePriceBookItemSchema.safeParse(raw)
  if (!parsed.success) return { success: false, error: parsed.error.errors[0].message }

  const data = parsed.data
  await db.priceBookItem.update({
    where: { id: itemId },
    data: {
      name: data.name,
      category: data.category || null,
      description: data.description || null,
      flatPriceCents: data.flatPriceCents,
      costCents: data.costCents,
      imageUrl: data.imageUrl || null,
    },
  })

  await trackEvent({
    organizationId: membership.organizationId,
    userId: session.user.id,
    eventName: 'price_book_item_updated',
    entityType: 'price_book_item',
    entityId: itemId,
  })

  return { success: true }
}

export async function deletePriceBookItem(itemId: string): Promise<ActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, error: 'You must be logged in' }

  const membership = await db.organizationMember.findFirst({
    where: { userId: session.user.id },
  })
  if (!membership) return { success: false, error: 'You must belong to an organization' }

  const item = await db.priceBookItem.findFirst({
    where: { id: itemId, organizationId: membership.organizationId },
  })
  if (!item) return { success: false, error: 'Item not found' }

  await db.priceBookItem.delete({ where: { id: itemId } })

  await trackEvent({
    organizationId: membership.organizationId,
    userId: session.user.id,
    eventName: 'price_book_item_deleted',
    entityType: 'price_book_item',
    entityId: itemId,
  })

  return { success: true }
}
