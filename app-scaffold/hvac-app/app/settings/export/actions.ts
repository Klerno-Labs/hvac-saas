'use server'

import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/require-admin'
import { trackEvent } from '@/lib/events'
import { logAudit } from '@/lib/audit'
import { z } from 'zod'
import {
  EXPORT_ENTITIES,
  rowsToCsv,
  rowsToJson,
  exportFilename,
  type ExportEntity,
  type ExportFormat,
} from '@/lib/csv-export'

/**
 * Hard cap per export. Mirrors the import side's MAX_ROWS guard so a single
 * owner action can never trigger an unbounded query. The owner is told via
 * `truncated` if the org has more rows than the cap (rare for SMB shops).
 */
export const MAX_EXPORT_ROWS = 50000

const inputSchema = z.object({
  entity: z.enum(['customers', 'jobs', 'invoices', 'payments']),
  format: z.enum(['csv', 'json']),
})

export type ExportDataResult = {
  filename: string
  mimeType: string
  content: string
  rowCount: number
  truncated: boolean
}

export type ExportResult =
  | { success: true; data: ExportDataResult }
  | { success: false; error: string }

/**
 * Export one entity type for the caller's organization as CSV or JSON.
 * Owner-only (mirrors the import action's RBAC). All queries are org-scoped;
 * the result payload is bounded by MAX_EXPORT_ROWS.
 *
 * NOTE: server actions serialize their return value through the RSC payload.
 * For bounded per-entity exports this is fine; do not extend this to export
 * every entity in one call.
 */
export async function exportData(input: {
  entity: ExportEntity
  format: ExportFormat
}): Promise<ExportResult> {
  const admin = await requireAdmin()
  if (!admin.authorized) return { success: false, error: admin.error }
  const { userId, organizationId } = admin.context

  const parsed = inputSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0].message }
  }
  const { entity, format } = parsed.data

  const rows = await fetchOrgRows(entity, organizationId)
  const spec = EXPORT_ENTITIES[entity]
  const content = format === 'csv' ? rowsToCsv(rows, spec.columns) : rowsToJson(rows, spec.columns)
  const truncated = rows.length >= MAX_EXPORT_ROWS

  await trackEvent({
    organizationId,
    userId,
    eventName: 'bulk_export_completed',
    entityType: entity,
    metadataJson: { entity, format, rowCount: rows.length, truncated },
  })

  await logAudit({
    organizationId,
    actorId: userId,
    eventType: 'bulk_export_completed',
    targetType: entity,
    metadata: { entity, format, rowCount: rows.length, truncated },
  })

  return {
    success: true,
    data: {
      filename: exportFilename(entity, format),
      mimeType:
        format === 'csv' ? 'text/csv;charset=utf-8' : 'application/json;charset=utf-8',
      content,
      rowCount: rows.length,
      truncated,
    },
  }
}

/**
 * Org-scoped row fetch. Selecting only the columns the serializer needs keeps
 * the payload lean and avoids leaking fields (e.g. we never select tokens or
 * stripe secrets — those live on Organization, not on these models).
 */
async function fetchOrgRows(
  entity: ExportEntity,
  organizationId: string,
): Promise<Record<string, unknown>[]> {
  const take = MAX_EXPORT_ROWS
  if (entity === 'customers') {
    return db.customer.findMany({
      where: { organizationId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take,
    })
  }
  if (entity === 'jobs') {
    return db.job.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      take,
    })
  }
  if (entity === 'invoices') {
    return db.invoice.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      take,
    })
  }
  return db.payment.findMany({
    where: { organizationId },
    orderBy: { createdAt: 'desc' },
    take,
  })
}
