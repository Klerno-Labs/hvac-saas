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

type CreateResult = { success: true; itemId: string } | { success: false; error: string }
type MutateResult = { success: true } | { success: false; error: string }

export async function createPriceBookItem(input: CreatePriceBookItemInput): Promise<CreateResult> {
  const admin = await requireAdmin()
  if (!admin.authorized) return { success: false, error: admin.error }
  const { organizationId, userId } = admin.context

  const parsed = createPriceBookItemSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.errors[0].message }
  const data = parsed.data

  const item = await db.priceBookItem.create({
    data: {
      organizationId,
      name: data.name,
      category: data.category || null,
      description: data.description || null,
      basePriceCents: data.basePriceCents,
      costCents: data.costCents,
      tier: data.tier ?? null,
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
  const admin = await requireAdmin()
  if (!admin.authorized) return { success: false, error: admin.error }
  const { organizationId, userId } = admin.context

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
      category: data.category || null,
      description: data.description || null,
      basePriceCents: data.basePriceCents,
      costCents: data.costCents,
      tier: data.tier ?? null,
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
  const admin = await requireAdmin()
  if (!admin.authorized) return { success: false, error: admin.error }
  const { organizationId, userId } = admin.context

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
  const { organizationId } = ctx

  return db.priceBookItem.findMany({
    where: { organizationId, deletedAt: null, isActive: true },
    include: { optionGroups: { orderBy: { sortOrder: 'asc' } } },
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
  })
}
