'use server'

import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/require-admin'
import { trackEvent } from '@/lib/events'
import { logAudit } from '@/lib/audit'
import { z } from 'zod'
import { parseCsv } from '@/lib/csv-import/parse'
import { suggestMapping, applyMapping } from '@/lib/csv-import/mapping'
import { validateRows } from '@/lib/csv-import/validate'
import {
  ENTITY_SPECS,
  type ImportEntityType,
  type EntityField,
} from '@/lib/csv-import/specs'

/** Hard caps to keep the bulk path bounded. */
export const MAX_FILE_BYTES = 5 * 1024 * 1024 // 5 MB
export const MAX_ROWS = 5000

const ENTITY_KEYS = Object.keys(ENTITY_SPECS) as ImportEntityType[]

export type FieldView = Pick<EntityField, 'key' | 'label' | 'required' | 'type' | 'enumValues' | 'help'>

export type PreviewResult = {
  entity: ImportEntityType
  label: string
  headers: string[]
  fields: FieldView[]
  suggestedMapping: Record<string, string>
  totalRows: number
  validRows: number
  invalidRows: number
  truncated: boolean
  /** First ~10 rows with mapped values + per-row status, for the preview table. */
  sample: { rowNum: number; values: Record<string, string>; status: 'ok' | 'error'; errors: string[] }[]
  /** First ~50 row-level errors across the whole file. */
  errorSample: { rowNum: number; errors: string[] }[]
}

export type ConfirmResult = {
  created: number
  skipped: number
  failed: number
  errors: { rowNum: number; message: string }[]
}

type ActionResult<T> = { success: true; data: T } | { success: false; error: string }

function readEntity(formData: FormData): ImportEntityType | null {
  const v = String(formData.get('entity') ?? '')
  return ENTITY_KEYS.includes(v as ImportEntityType) ? (v as ImportEntityType) : null
}

async function readFileText(formData: FormData): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const file = formData.get('file')
  if (!(file instanceof File)) return { ok: false, error: 'No file uploaded' }
  if (file.size === 0) return { ok: false, error: 'The file is empty' }
  if (file.size > MAX_FILE_BYTES) {
    return { ok: false, error: `File exceeds the ${MAX_FILE_BYTES / 1024 / 1024}MB limit` }
  }
  const text = await file.text()
  return { ok: true, text }
}

/**
 * Step 1 — parse + auto-map + validate the uploaded file. Returns everything
 * the client needs to render the mapping editor and a validation preview.
 * No records are written.
 */
export async function previewImport(formData: FormData): Promise<ActionResult<PreviewResult>> {
  const admin = await requireAdmin()
  if (!admin.authorized) return { success: false, error: admin.error }

  const entity = readEntity(formData)
  if (!entity) return { success: false, error: 'Unknown import type' }

  const fileResult = await readFileText(formData)
  if (!fileResult.ok) return { success: false, error: fileResult.error }

  const spec = ENTITY_SPECS[entity]
  const { headers, rows } = parseCsv(fileResult.text)
  if (headers.length === 0) {
    return { success: false, error: 'Could not read any columns. Is this a CSV with a header row?' }
  }
  if (rows.length === 0) {
    return { success: false, error: 'The file has a header row but no data rows.' }
  }

  const truncated = rows.length > MAX_ROWS
  const capped = truncated ? rows.slice(0, MAX_ROWS) : rows

  const suggestedMapping = suggestMapping(headers, spec)
  const mapped = applyMapping(capped, headers, suggestedMapping, spec)
  const validated = validateRows(mapped, spec)

  const validRows = validated.filter((r) => r.ok).length
  const invalidRows = validated.length - validRows

  const sample = validated.slice(0, 10).map((r, i) => ({
    rowNum: i + 1,
    values: r.raw,
    status: r.ok ? ('ok' as const) : ('error' as const),
    errors: r.ok ? [] : r.errors.map((e) => e.message),
  }))

  const errorSample = validated
    .map((r, i) => ({ rowNum: i + 1, r }))
    .filter((x) => !x.r.ok)
    .slice(0, 50)
    .map((x) => ({ rowNum: x.rowNum, errors: x.r.errors.map((e) => e.message) }))

  return {
    success: true,
    data: {
      entity,
      label: spec.label,
      headers,
      fields: spec.fields.map((f) => ({
        key: f.key,
        label: f.label,
        required: f.required,
        type: f.type,
        enumValues: f.enumValues ? [...f.enumValues] : undefined,
        help: f.help,
      })),
      suggestedMapping,
      totalRows: capped.length,
      validRows,
      invalidRows,
      truncated,
      sample,
      errorSample,
    },
  }
}

const mappingSchema = z.record(z.string(), z.string())

/**
 * Step 2 — re-parse the original file, apply the user's (possibly edited)
 * column mapping, re-validate, then bulk-create org-scoped records inside a
 * single transaction. Idempotent: duplicates (by the entity's dedupe key) that
 * already exist in the org OR earlier in the same file are skipped, not
 * duplicated. Per-row failures are reported individually and never abort the
 * whole import.
 */
export async function confirmImport(formData: FormData): Promise<ActionResult<ConfirmResult>> {
  const admin = await requireAdmin()
  if (!admin.authorized) return { success: false, error: admin.error }
  const { userId, organizationId } = admin.context

  const entity = readEntity(formData)
  if (!entity) return { success: false, error: 'Unknown import type' }

  const fileResult = await readFileText(formData)
  if (!fileResult.ok) return { success: false, error: fileResult.error }

  const mappingRaw = formData.get('mapping')
  if (typeof mappingRaw !== 'string') {
    return { success: false, error: 'Missing column mapping' }
  }
  let mapping: Record<string, string>
  try {
    mapping = mappingSchema.parse(JSON.parse(mappingRaw))
  } catch {
    return { success: false, error: 'Invalid column mapping' }
  }

  const spec = ENTITY_SPECS[entity]
  const { headers, rows } = parseCsv(fileResult.text)
  if (headers.length === 0 || rows.length === 0) {
    return { success: false, error: 'File has no importable rows' }
  }

  const capped = rows.length > MAX_ROWS ? rows.slice(0, MAX_ROWS) : rows
  const mapped = applyMapping(capped, headers, mapping, spec)
  const validated = validateRows(mapped, spec)

  const errors: { rowNum: number; message: string }[] = []

  // Partition rows by validity; keep original 1-indexed row numbers.
  const goodRows: GoodRow[] = []
  validated.forEach((r, i) => {
    const rowNum = i + 1
    if (!r.ok) {
      errors.push({ rowNum, message: r.errors.map((e) => e.message).join('; ') })
      return
    }
    goodRows.push({ rowNum, data: r.data, raw: r.raw })
  })

  const result = await db.$transaction(async (tx) => {
    if (entity === 'customers') return bulkCustomers(tx, organizationId, goodRows)
    if (entity === 'pricebook') return bulkPricebook(tx, organizationId, goodRows)
    return bulkEquipment(tx, organizationId, goodRows, errors)
  })

  await trackEvent({
    organizationId,
    userId,
    eventName: 'bulk_import_completed',
    entityType: entity === 'pricebook' ? 'inventory_item' : entity,
    metadataJson: {
      entity,
      totalRows: capped.length,
      created: result.created,
      skipped: result.skipped,
      failed: errors.length,
    },
  })

  await logAudit({
    organizationId,
    actorId: userId,
    eventType: 'bulk_import_completed',
    targetType: entity === 'pricebook' ? 'inventory_item' : entity,
    metadata: {
      entity,
      created: result.created,
      skipped: result.skipped,
      failed: errors.length,
    },
  })

  return {
    success: true,
    data: {
      created: result.created,
      skipped: result.skipped,
      failed: errors.length,
      // Keep the payload bounded for the UI; full count is in `failed`.
      errors: errors.slice(0, 200),
    },
  }
}

type GoodRow = { rowNum: number; data: Record<string, unknown>; raw: Record<string, string> }

/** Customers: dedupe by lowercase email within org + within file. */
async function bulkCustomers(
  tx: Parameters<Parameters<typeof db['$transaction']>[0]>[0],
  organizationId: string,
  goodRows: GoodRow[],
): Promise<{ created: number; skipped: number }> {
  const emails = goodRows
    .map((r) => (r.data.email as string | undefined)?.trim().toLowerCase())
    .filter((e): e is string => !!e)

  const existing = emails.length
    ? new Set(
        (
          await tx.customer.findMany({
            where: { organizationId, email: { in: emails }, deletedAt: null },
            select: { email: true },
          })
        ).map((c) => (c.email as string).toLowerCase()),
      )
    : new Set<string>()

  const seenInFile = new Set<string>()
  const toCreate: Parameters<typeof tx.customer.createMany>[0]['data'][] = []
  let skipped = 0

  for (const row of goodRows) {
    const d = row.data
    const email = (d.email as string | undefined)?.trim().toLowerCase() || ''
    if (email) {
      if (existing.has(email) || seenInFile.has(email)) {
        skipped++
        continue
      }
      seenInFile.add(email)
    }
    toCreate.push({
      organizationId,
      firstName: d.firstName as string,
      lastName: (d.lastName as string) || null,
      companyName: (d.companyName as string) || null,
      email: (d.email as string) || null,
      phone: d.phone as string,
      addressLine1: (d.addressLine1 as string) || null,
      addressLine2: (d.addressLine2 as string) || null,
      city: (d.city as string) || null,
      state: (d.state as string) || null,
      postalCode: (d.postalCode as string) || null,
      notes: (d.notes as string) || null,
    })
  }

  const created = toCreate.length ? (await tx.customer.createMany({ data: toCreate })).count : 0
  return { created, skipped }
}

/** Price book (InventoryItem): dedupe by sku within org + within file. */
async function bulkPricebook(
  tx: Parameters<Parameters<typeof db['$transaction']>[0]>[0],
  organizationId: string,
  goodRows: GoodRow[],
): Promise<{ created: number; skipped: number }> {
  const skus = goodRows
    .map((r) => (r.data.sku as string | undefined)?.trim())
    .filter((s): s is string => !!s)

  const existing = skus.length
    ? new Set(
        (
          await tx.inventoryItem.findMany({
            where: { organizationId, sku: { in: skus } },
            select: { sku: true },
          })
        ).map((i) => (i.sku as string).trim()),
      )
    : new Set<string>()

  const seenInFile = new Set<string>()
  const toCreate: Parameters<typeof tx.inventoryItem.createMany>[0]['data'][] = []
  let skipped = 0

  for (const row of goodRows) {
    const d = row.data
    const sku = (d.sku as string | undefined)?.trim() || ''
    if (sku) {
      if (existing.has(sku) || seenInFile.has(sku)) {
        skipped++
        continue
      }
      seenInFile.add(sku)
    }
    toCreate.push({
      organizationId,
      name: d.name as string,
      sku: sku || null,
      description: (d.description as string) || null,
      unitCostCents: (d.unitCostCents as number) ?? 0,
      sellPriceCents: (d.sellPriceCents as number) ?? 0,
      quantityOnHand: (d.quantityOnHand as number) ?? 0,
      reorderPoint: (d.reorderPoint as number) ?? 0,
      category: (d.category as string) || null,
    })
  }

  const created = toCreate.length ? (await tx.inventoryItem.createMany({ data: toCreate })).count : 0
  return { created, skipped }
}

/**
 * Equipment: dedupe by serial within org + within file, and resolve each row to
 * an existing customer in the org by email (preferred) or phone. Rows with no
 * resolvable customer are reported as per-row errors, not silently dropped.
 */
async function bulkEquipment(
  tx: Parameters<Parameters<typeof db['$transaction']>[0]>[0],
  organizationId: string,
  goodRows: GoodRow[],
  errors: { rowNum: number; message: string }[],
): Promise<{ created: number; skipped: number }> {
  const serials = goodRows
    .map((r) => (r.data.serial as string | undefined)?.trim())
    .filter((s): s is string => !!s)

  const existingSerials = serials.length
    ? new Set(
        (
          await tx.equipment.findMany({
            where: { organizationId, serial: { in: serials } },
            select: { serial: true },
          })
        ).map((e) => (e.serial as string).trim()),
      )
    : new Set<string>()

  // Customer resolution (email preferred, then phone) — one query.
  const emails = goodRows
    .map((r) => (r.data.customerEmail as string | undefined)?.trim().toLowerCase())
    .filter((e): e is string => !!e)
  const phones = goodRows
    .map((r) => (r.data.customerPhone as string | undefined)?.trim())
    .filter((p): p is string => !!p)

  const customers = emails.length || phones.length
    ? await tx.customer.findMany({
        where: {
          organizationId,
          deletedAt: null,
          OR: [
            ...(emails.length ? [{ email: { in: emails } }] : []),
            ...(phones.length ? [{ phone: { in: phones } }] : []),
          ],
        },
        select: { id: true, email: true, phone: true },
      })
    : []

  const byEmail = new Map<string, string>()
  const byPhone = new Map<string, string>()
  for (const c of customers) {
    if (c.email) byEmail.set(c.email.toLowerCase(), c.id)
    if (c.phone) byPhone.set(c.phone, c.id)
  }

  const seenSerials = new Set<string>()
  const toCreate: Parameters<typeof tx.equipment.createMany>[0]['data'][] = []
  let skipped = 0

  for (const row of goodRows) {
    const d = row.data
    const serial = (d.serial as string | undefined)?.trim() || ''
    if (serial) {
      if (existingSerials.has(serial) || seenSerials.has(serial)) {
        skipped++
        continue
      }
      seenSerials.add(serial)
    }

    const email = (d.customerEmail as string | undefined)?.trim().toLowerCase() || ''
    const phone = (d.customerPhone as string | undefined)?.trim() || ''
    const customerId = (email && byEmail.get(email)) || (phone && byPhone.get(phone)) || ''
    if (!customerId) {
      errors.push({
        rowNum: row.rowNum,
        message:
          'No existing customer matched this row. Import the customer first (match by email or phone).',
      })
      continue
    }

    toCreate.push({
      organizationId,
      customerId,
      type: d.type as string,
      make: (d.make as string) || null,
      model: (d.model as string) || null,
      serial: serial || null,
      installDate: d.installDate ? new Date(d.installDate as string) : null,
      tonnage: (d.tonnage as number) ?? null,
      seer: (d.seer as number) ?? null,
      btu: (d.btu as number) ?? null,
      locationOnProperty: (d.locationOnProperty as string) || null,
      notes: (d.notes as string) || null,
    })
  }

  const created = toCreate.length ? (await tx.equipment.createMany({ data: toCreate })).count : 0
  return { created, skipped }
}
