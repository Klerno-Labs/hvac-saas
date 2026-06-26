'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { trackEvent } from '@/lib/events'
import {
  createPriceBookItemSchema,
  updatePriceBookItemSchema,
  type CreatePriceBookItemInput,
  type UpdatePriceBookItemInput,
} from '@/lib/validations/pricebook'

type CreateResult = { success: true; itemId: string } | { success: false; error: string }
type ActionResult = { success: true } | { success: false; error: string }

async function getCtx() {
  const session = await auth()
  if (!session?.user?.id) return null
  const membership = await db.organizationMember.findFirst({
    where: { userId: session.user.id },
  })
  if (!membership) return null
  return { userId: session.user.id, organizationId: membership.organizationId }
}

export async function createPriceBookItem(
  input: CreatePriceBookItemInput,
): Promise<CreateResult> {
  const ctx = await getCtx()
  if (!ctx) return { success: false, error: 'Not authenticated' }

  const parsed = createPriceBookItemSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.errors[0].message }

  const data = parsed.data

  const item = await db.priceBookItem.create({
    data: {
      organizationId: ctx.organizationId,
      name: data.name,
      category: data.category || null,
      description: data.description || null,
      flatPriceCents: data.flatPriceCents,
      costCents: data.costCents ?? 0,
      imageUrl: data.imageUrl || null,
      ...(data.optionGroups?.length
        ? {
            optionGroups: {
              create: data.optionGroups.map((og, i) => ({
                tier: og.tier,
                name: og.name,
                description: og.description || null,
                priceCents: og.priceCents,
                sortOrder: og.sortOrder ?? i,
              })),
            },
          }
        : {}),
    },
  })

  await trackEvent({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    eventName: 'pricebook_item_created',
    entityType: 'pricebook_item',
    entityId: item.id,
  })

  return { success: true, itemId: item.id }
}

export async function updatePriceBookItem(
  itemId: string,
  input: UpdatePriceBookItemInput,
): Promise<ActionResult> {
  const ctx = await getCtx()
  if (!ctx) return { success: false, error: 'Not authenticated' }

  const existing = await db.priceBookItem.findFirst({
    where: { id: itemId, organizationId: ctx.organizationId, deletedAt: null },
  })
  if (!existing) return { success: false, error: 'Item not found' }

  const parsed = updatePriceBookItemSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.errors[0].message }

  const data = parsed.data

  await db.priceBookOptionGroup.deleteMany({ where: { priceBookItemId: itemId } })
  await db.priceBookItem.update({
    where: { id: itemId },
    data: {
      name: data.name,
      category: data.category || null,
      description: data.description || null,
      flatPriceCents: data.flatPriceCents,
      costCents: data.costCents ?? 0,
      imageUrl: data.imageUrl || null,
      ...(data.optionGroups?.length
        ? {
            optionGroups: {
              create: data.optionGroups.map((og, i) => ({
                tier: og.tier,
                name: og.name,
                description: og.description || null,
                priceCents: og.priceCents,
                sortOrder: og.sortOrder ?? i,
              })),
            },
          }
        : {}),
    },
  })

  await trackEvent({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    eventName: 'pricebook_item_updated',
    entityType: 'pricebook_item',
    entityId: itemId,
  })

  return { success: true }
}

export async function deletePriceBookItem(itemId: string): Promise<ActionResult> {
  const ctx = await getCtx()
  if (!ctx) return { success: false, error: 'Not authenticated' }

  const existing = await db.priceBookItem.findFirst({
    where: { id: itemId, organizationId: ctx.organizationId, deletedAt: null },
  })
  if (!existing) return { success: false, error: 'Item not found' }

  await db.priceBookItem.update({
    where: { id: itemId },
    data: { deletedAt: new Date() },
  })

  await trackEvent({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    eventName: 'pricebook_item_deleted',
    entityType: 'pricebook_item',
    entityId: itemId,
  })

  return { success: true }
}

export async function listPriceBookItems() {
  const ctx = await getCtx()
  if (!ctx) return []

  return db.priceBookItem.findMany({
    where: { organizationId: ctx.organizationId, deletedAt: null },
    include: { optionGroups: true },
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
  })
}
