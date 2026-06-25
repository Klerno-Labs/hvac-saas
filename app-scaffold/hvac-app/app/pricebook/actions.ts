'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { trackEvent } from '@/lib/events'
import {
  createPriceBookItemSchema,
  updatePriceBookItemSchema,
} from '@/lib/validations/pricebook'
import type {
  CreatePriceBookItemInput,
  UpdatePriceBookItemInput,
} from '@/lib/validations/pricebook'

type ActionResult = { success: true } | { success: false; error: string }

async function getContext(): Promise<
  { organizationId: string; userId: string } | { error: string }
> {
  const session = await auth()
  if (!session?.user?.id) return { error: 'You must be logged in' }
  const membership = await db.organizationMember.findFirst({
    where: { userId: session.user.id },
  })
  if (!membership) return { error: 'You must belong to an organization' }
  return { organizationId: membership.organizationId, userId: session.user.id }
}

export async function createPriceBookItem(
  input: CreatePriceBookItemInput
): Promise<ActionResult> {
  const ctx = await getContext()
  if ('error' in ctx) return { success: false, error: ctx.error }

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
      costCents: data.costCents ?? null,
      imageUrl: data.imageUrl || null,
      optionGroups: {
        create: data.optionGroups.map((g, i) => ({
          tier: g.tier,
          name: g.name,
          description: g.description || null,
          priceCents: g.priceCents,
          sortOrder: i,
        })),
      },
    },
  })

  await trackEvent({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    eventName: 'pricebook_item_created',
    entityType: 'pricebook_item',
    entityId: item.id,
  })

  return { success: true }
}

export async function updatePriceBookItem(
  itemId: string,
  input: UpdatePriceBookItemInput
): Promise<ActionResult> {
  const ctx = await getContext()
  if ('error' in ctx) return { success: false, error: ctx.error }

  const existing = await db.priceBookItem.findFirst({
    where: { id: itemId, organizationId: ctx.organizationId, deletedAt: null },
  })
  if (!existing) return { success: false, error: 'Item not found' }

  const parsed = updatePriceBookItemSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.errors[0].message }

  const data = parsed.data

  await db.$transaction(async (tx) => {
    await tx.priceBookOptionGroup.deleteMany({ where: { priceBookItemId: itemId } })
    await tx.priceBookItem.update({
      where: { id: itemId },
      data: {
        name: data.name,
        category: data.category || null,
        description: data.description || null,
        flatPriceCents: data.flatPriceCents,
        costCents: data.costCents ?? null,
        imageUrl: data.imageUrl || null,
        optionGroups: {
          create: data.optionGroups.map((g, i) => ({
            tier: g.tier,
            name: g.name,
            description: g.description || null,
            priceCents: g.priceCents,
            sortOrder: i,
          })),
        },
      },
    })
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
  const ctx = await getContext()
  if ('error' in ctx) return { success: false, error: ctx.error }

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
  const ctx = await getContext()
  if ('error' in ctx) return { success: false as const, error: ctx.error }

  const items = await db.priceBookItem.findMany({
    where: { organizationId: ctx.organizationId, deletedAt: null },
    include: { optionGroups: true },
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
  })

  return { success: true as const, items }
}
