'use server'

import { requireMutationAccess } from '@/lib/mutation-access'
import { db } from '@/lib/db'
import { trackEvent } from '@/lib/events'
import { createPriceBookItemSchema } from '@/lib/validations/pricebook'

type CreateResult = { success: true; itemId: string } | { success: false; error: string }

export async function createPriceBookItem(formData: FormData): Promise<CreateResult> {
  const access = await requireMutationAccess('editPricing')
  if (!access.authorized) return { success: false, error: access.error }
  const { session, membership, userId, organizationId } = access.context

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
