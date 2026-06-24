'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { trackEvent } from '@/lib/events'
import { createPriceBookItemSchema } from '@/lib/validations/price-book'

type CreatePriceBookItemResult =
  | { success: true; itemId: string }
  | { success: false; error: string }

export async function createPriceBookItem(formData: FormData): Promise<CreatePriceBookItemResult> {
  const session = await auth()
  if (!session?.user?.id) {
    return { success: false, error: 'You must be logged in' }
  }

  const userId = session.user.id

  const membership = await db.organizationMember.findFirst({
    where: { userId },
  })
  if (!membership) {
    return { success: false, error: 'You must belong to an organization' }
  }

  const organizationId = membership.organizationId

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

  const parsed = createPriceBookItemSchema.safeParse(raw)
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0].message }
  }

  const data = parsed.data

  const item = await db.priceBookItem.create({
    data: {
      organizationId,
      name: data.name,
      category: data.category || null,
      description: data.description || null,
      flatPriceCents: data.flatPriceCents,
      costCents: data.costCents,
      imageUrl: data.imageUrl || null,
    },
  })

  await trackEvent({
    organizationId,
    userId,
    eventName: 'price_book_item_created',
    entityType: 'price_book_item',
    entityId: item.id,
  })

  return { success: true, itemId: item.id }
}
