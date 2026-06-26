'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/require-admin'
import { trackEvent } from '@/lib/events'
import { createPriceBookItemSchema } from '@/lib/validations/pricebook'
import { parsePriceBookCsv } from '@/lib/validations/pricebook-import'

type CreateResult =
  | { success: true; itemId: string }
  | { success: false; error: string }

export async function createPriceBookItem(formData: FormData): Promise<CreateResult> {
  const session = await auth()
  if (!session?.user?.id) {
    return { success: false, error: 'You must be logged in' }
  }

  const membership = await db.organizationMember.findFirst({
    where: { userId: session.user.id },
  })
  if (!membership) {
    return { success: false, error: 'You must belong to an organization' }
  }

  const organizationId = membership.organizationId

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
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0].message }
  }

  const d = parsed.data
  const item = await db.priceBookItem.create({
    data: {
      organizationId,
      name: d.name,
      category: d.category || null,
      description: d.description || null,
      flatPriceCents: d.flatPriceCents,
      costCents: d.costCents ?? null,
      imageUrl: d.imageUrl || null,
    },
  })

  await trackEvent({
    organizationId,
    userId: session.user.id,
    eventName: 'pricebook_item_created',
    entityType: 'pricebook_item',
    entityId: item.id,
  })

  return { success: true, itemId: item.id }
}

type ImportResult =
  | { success: true; created: number; updated: number; skipped: number; errors: { line: number; message: string }[] }
  | { success: false; error: string }

export async function importPriceBookItems(csvText: string): Promise<ImportResult> {
  const adminResult = await requireAdmin()
  if (!adminResult.authorized) {
    return { success: false, error: adminResult.error }
  }

  const { userId, organizationId } = adminResult.context

  const { rows, errors } = parsePriceBookCsv(csvText)

  let created = 0
  let updated = 0

  for (const row of rows) {
    const existing = await db.priceBookItem.findFirst({
      where: { organizationId, name: row.name, deletedAt: null },
    })

    if (existing) {
      await db.priceBookItem.update({
        where: { id: existing.id },
        data: {
          category: row.category ?? null,
          description: row.description ?? null,
          flatPriceCents: row.flatPriceCents,
          costCents: row.costCents ?? null,
          imageUrl: row.imageUrl ?? null,
        },
      })
      updated++
    } else {
      await db.priceBookItem.create({
        data: {
          organizationId,
          name: row.name,
          category: row.category ?? null,
          description: row.description ?? null,
          flatPriceCents: row.flatPriceCents,
          costCents: row.costCents ?? null,
          imageUrl: row.imageUrl ?? null,
        },
      })
      created++
    }
  }

  await trackEvent({
    organizationId,
    userId,
    eventName: 'pricebook_imported',
    metadataJson: { created, updated, skipped: errors.length },
  })

  return {
    success: true,
    created,
    updated,
    skipped: errors.length,
    errors,
  }
}
