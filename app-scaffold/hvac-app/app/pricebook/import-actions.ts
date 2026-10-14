'use server'

import { requireMutationAccess } from '@/lib/mutation-access'
import { db } from '@/lib/db'
import { trackEvent } from '@/lib/events'
import { parsePriceBookCsv } from '@/lib/validations/pricebook-import'

const MAX_IMPORT_ROWS = 5000

type ImportResult =
  | { success: true; created: number; updated: number; skipped: number; errors: { line: number; message: string }[] }
  | { success: false; error: string }

export async function importPriceBookItems(csvText: string): Promise<ImportResult> {
  const adminResult = await requireMutationAccess('manageBilling')
  if (!adminResult.authorized) {
    return { success: false, error: adminResult.error }
  }
  const ctx = adminResult.context

  if (typeof csvText !== 'string' || csvText.length > 2_000_000) return { success: false, error: 'CSV must be no larger than 2 MB' }
  const { rows, errors } = parsePriceBookCsv(csvText)

  if (rows.length + errors.length > MAX_IMPORT_ROWS) {
    return { success: false, error: `Import exceeds the maximum of ${MAX_IMPORT_ROWS} rows` }
  }

  let created = 0, updated = 0
  try {
    await db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "Organization" WHERE id = ${ctx.organizationId} FOR UPDATE`
      const existingItems = await tx.priceBookItem.findMany({
        where: { organizationId: ctx.organizationId, deletedAt: null },
        select: { id: true, name: true },
      })
      const existingByName = new Map(existingItems.map(i => [i.name, i.id]))


      for (const row of rows) {
        const existingId = existingByName.get(row.name)
        if (existingId) {
          await tx.priceBookItem.update({
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
          const item = await tx.priceBookItem.create({
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
          existingByName.set(row.name, item.id)
          created++
        }
      }
    }, { timeout: 60_000 })
  } catch {
    return { success: false, error: 'The import could not be saved. No items were changed; please try again.' }
  }

  await trackEvent({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    eventName: 'pricebook_imported',
    metadataJson: { created, updated, skipped: errors.length },
  })

  return { success: true, created, updated, skipped: errors.length, errors }
}
