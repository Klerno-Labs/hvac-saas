'use server'

import { requireAdmin } from '@/lib/require-admin'
import { requireAuth } from '@/lib/session'
import { db } from '@/lib/db'
import { trackEvent } from '@/lib/events'
import {
  createPriceBookItemSchema,
  updatePriceBookItemSchema,
  buildOptionGroupRows,
  type CreatePriceBookItemInput,
  type UpdatePriceBookItemInput,
} from '@/lib/validations/pricebook'

type ItemResult = { success: true; itemId: string } | { success: false; error: string }
type MutateResult = { success: true } | { success: false; error: string }

export async function createPriceBookItem(input: CreatePriceBookItemInput): Promise<ItemResult> {
  const adminResult = await requireAdmin()
  if (!adminResult.authorized) return { success: false, error: adminResult.error }

  const { organizationId, userId } = adminResult.context

  const parsed = createPriceBookItemSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.errors[0].message }

  const data = parsed.data

  const item = await db.priceBookItem.create({
    data: {
      organizationId,
      name: data.name,
      description: data.description || null,
      category: data.category || null,
      tier: data.tier,
      basePriceCents: data.basePriceCents,
      costCents: data.costCents,
      isActive: data.isActive,
      optionGroups: {
        create: buildOptionGroupRows(data.optionGroups, organizationId),
      },
    },
  })

  await trackEvent({
    organizationId,
    userId,
    eventName: 'pricebook_item_created',
    entityType: 'pricebook_item',
    entityId: item.id,
  })

  return { success: true, itemId: item.id }
}

export async function updatePriceBookItem(
  itemId: string,
  input: UpdatePriceBookItemInput,
): Promise<MutateResult> {
  const adminResult = await requireAdmin()
  if (!adminResult.authorized) return { success: false, error: adminResult.error }

  const { organizationId, userId } = adminResult.context

  const existing = await db.priceBookItem.findFirst({
    where: { id: itemId, organizationId, deletedAt: null },
  })
  if (!existing) return { success: false, error: 'Price book item not found' }

  const parsed = updatePriceBookItemSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.errors[0].message }

  const data = parsed.data

  await db.optionGroup.deleteMany({ where: { priceBookItemId: itemId, organizationId } })

  await db.priceBookItem.update({
    where: { id: itemId },
    data: {
      name: data.name,
      description: data.description || null,
      category: data.category || null,
      tier: data.tier,
      basePriceCents: data.basePriceCents,
      costCents: data.costCents,
      isActive: data.isActive,
      optionGroups: {
        create: buildOptionGroupRows(data.optionGroups, organizationId),
      },
    },
  })

  await trackEvent({
    organizationId,
    userId,
    eventName: 'pricebook_item_updated',
    entityType: 'pricebook_item',
    entityId: itemId,
  })

  return { success: true }
}

export async function deletePriceBookItem(itemId: string): Promise<MutateResult> {
  const adminResult = await requireAdmin()
  if (!adminResult.authorized) return { success: false, error: adminResult.error }

  const { organizationId, userId } = adminResult.context

  const existing = await db.priceBookItem.findFirst({
    where: { id: itemId, organizationId, deletedAt: null },
  })
  if (!existing) return { success: false, error: 'Price book item not found' }

  await db.priceBookItem.update({
    where: { id: itemId },
    data: { deletedAt: new Date() },
  })

  await trackEvent({
    organizationId,
    userId,
    eventName: 'pricebook_item_deleted',
    entityType: 'pricebook_item',
    entityId: itemId,
  })

  return { success: true }
}

export async function listPriceBookItems() {
  const ctx = await requireAuth()

  return db.priceBookItem.findMany({
    where: { organizationId: ctx.organizationId, deletedAt: null, isActive: true },
    include: {
      optionGroups: { orderBy: { sortOrder: 'asc' } },
    },
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
  })
}
