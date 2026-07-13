'use server'

import { requireAdmin } from '@/lib/require-admin'
import { db } from '@/lib/db'
import { trackEvent } from '@/lib/events'
import { parsePriceBookCsv } from '@/lib/validations/pricebook-import'

const MAX_IMPORT_ROWS = 5000

type ImportResult =
  | { success: true; created: number; updated: number; skipped: number; errors: { line: number; message: string }[] }
  | { success: false; error: string }

export async function importPriceBookItems(csvText: string): Promise<ImportResult> {
  const adminResult = await requireAdmin()
  if (!adminResult.authorized) {
    return { success: false, error: adminResult.error }
  }
  const ctx = adminResult.context

  const { rows, errors } = parsePriceBookCsv(csvText)

  if (rows.length + errors.length > MAX_IMPORT_ROWS) {
    return { success: false, error: `Import exceeds the maximum of ${MAX_IMPORT_ROWS} rows` }
  }

  const existingItems = await db.priceBookItem.findMany({
    where: { organizationId: ctx.organizationId, deletedAt: null },
    select: { id: true, name: true },
  })
  const existingByName = new Map(existingItems.map(i => [i.name, i.id]))

  let created = 0
  let updated = 0

  for (const row of rows) {
    const existingId = existingByName.get(row.name)
    if (existingId) {
      await db.priceBookItem.update({
        where: { id: existingId },
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
          organizationId: ctx.organizationId,
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
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    eventName: 'pricebook_imported',
    metadataJson: { created, updated, skipped: errors.length },
  })

  return { success: true, created, updated, skipped: errors.length, errors }
}
