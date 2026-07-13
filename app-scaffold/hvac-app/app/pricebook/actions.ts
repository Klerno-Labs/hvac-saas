'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { trackEvent } from '@/lib/events'
import { createPriceBookItemSchema } from '@/lib/validations/pricebook'

type CreateResult = { success: true; itemId: string } | { success: false; error: string }

export async function createPriceBookItem(formData: FormData): Promise<CreateResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, error: 'You must be logged in' }

  const membership = await db.organizationMember.findFirst({ where: { userId: session.user.id } })
  if (!membership) return { success: false, error: 'You must belong to an organization' }

  const raw = {
    name: formData.get('name'),
    category: formData.get('category') || undefined,
    description: formData.get('description') || undefined,
    flatPriceCents: Math.round(parseFloat((formData.get('flatPrice') as string) || '0') * 100),
    costCents: formData.get('cost')
      ? Math.round(parseFloat(formData.get('cost') as string) * 100)
      : undefined,
    imageUrl: formData.get('imageUrl') || undefined,
  }

  const parsed = createPriceBookItemSchema.safeParse(raw)
  if (!parsed.success) return { success: false, error: parsed.error.errors[0].message }

  const data = parsed.data
  const item = await db.priceBookItem.create({
    data: {
      organizationId: membership.organizationId,
      name: data.name,
      category: data.category || null,
      description: data.description || null,
      flatPriceCents: data.flatPriceCents,
      costCents: data.costCents ?? null,
      imageUrl: data.imageUrl || null,
    },
  })

  await trackEvent({
    organizationId: membership.organizationId,
    userId: session.user.id,
    eventName: 'pricebook_item_created',
    entityType: 'pricebook_item',
    entityId: item.id,
  })

  return { success: true, itemId: item.id }
}
