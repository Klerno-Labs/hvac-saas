'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { trackEvent } from '@/lib/events'
import { logAudit } from '@/lib/audit'
import { validateRow } from '@/lib/csv-import/validate'
import { ENTITY_SPECS, type ImportEntityType } from '@/lib/csv-import/specs'

// ---------- shared input shape ----------

export type ImportInput = {
  kind: ImportEntityType
  rows: Record<string, string>[]
  mapping: Record<string, string | null>
}

// ---------- return types ----------

type InvalidRow = { rowIndex: number; errors: string[] }
type DuplicateRow = { rowIndex: number; reason: string }
type RowReport = { rowIndex: number; reason: string }

export type PreviewResult =
  | { success: false; error: string }
  | {
      success: true
      total: number
      valid: number
      invalidRows: InvalidRow[]
      duplicateRows: DuplicateRow[]
      sample: Record<string, unknown>[]
    }

export type CommitResult =
  | { success: false; error: string }
  | {
      success: true
      created: number
      skippedDuplicates: number
      skippedInvalid: number
      errors: RowReport[]
    }

// ---------- constants ----------

const MAX_ROWS = 5000

// ---------- auth / tenant helper (mirrors app/customers/new/actions.ts exactly) ----------

async function getOrgContext(): Promise<{ userId: string; organizationId: string } | null> {
  const session = await auth()
  if (!session?.user?.id) return null
  const userId = session.user.id
  const membership = await db.organizationMember.findFirst({ where: { userId } })
  if (!membership) return null
  return { userId, organizationId: membership.organizationId }
}

// ---------- internal helpers ----------

function applyMappingToRows(
  rows: Record<string, string>[],
  mapping: Record<string, string | null>,
): Record<string, string>[] {
  return rows.map((row) => {
    const obj: Record<string, string> = {}
    for (const [fieldKey, colHeader] of Object.entries(mapping)) {
      if (!colHeader) continue
      obj[fieldKey] = row[colHeader] ?? ''
    }
    return obj
  })
}

function extractDedupeKey(kind: ImportEntityType, data: Record<string, unknown>): string | null {
  if (kind === 'customers') {
    const email = typeof data.email === 'string' ? data.email.toLowerCase().trim() : ''
    return email || null
  }
  if (kind === 'pricebook') {
    const sku = typeof data.sku === 'string' ? data.sku.trim() : ''
    return sku || null
  }
  // equipment
  const serial = typeof data.serial === 'string' ? data.serial.trim() : ''
  return serial || null
}

async function fetchExistingKeys(
  kind: ImportEntityType,
  organizationId: string,
  keys: string[],
): Promise<Set<string>> {
  if (keys.length === 0) return new Set()

  if (kind === 'customers') {
    const rows = await db.customer.findMany({
      where: { organizationId, email: { in: keys, mode: 'insensitive' } },
      select: { email: true },
    })
    return new Set(rows.map((r) => (r.email ?? '').toLowerCase()).filter(Boolean))
  }

  if (kind === 'pricebook') {
    const rows = await db.inventoryItem.findMany({
      where: { organizationId, sku: { in: keys } },
      select: { sku: true },
    })
    return new Set(rows.map((r) => r.sku ?? '').filter(Boolean))
  }

  // equipment
  const rows = await db.equipment.findMany({
    where: { organizationId, serial: { in: keys } },
    select: { serial: true },
  })
  return new Set(rows.map((r) => r.serial ?? '').filter(Boolean))
}

// ---------- exported server actions ----------

export async function previewImport(input: ImportInput): Promise<PreviewResult> {
  try {
    const ctx = await getOrgContext()
    if (!ctx) return { success: false, error: 'Authentication required' }
    const { organizationId } = ctx

    const { kind, rows, mapping } = input

    if (rows.length > MAX_ROWS) {
      return { success: false, error: `Import is limited to ${MAX_ROWS} rows per file.` }
    }

    const spec = ENTITY_SPECS[kind]
    const mapped = applyMappingToRows(rows, mapping)

    const invalidRows: InvalidRow[] = []
    const validData: { rowIndex: number; data: Record<string, unknown>; key: string | null }[] = []

    for (let i = 0; i < mapped.length; i++) {
      const result = validateRow(mapped[i], spec)
      if (!result.ok) {
        invalidRows.push({ rowIndex: i, errors: result.errors.map((e) => e.message) })
      } else {
        validData.push({ rowIndex: i, data: result.data, key: extractDedupeKey(kind, result.data) })
      }
    }

    const keysToCheck = validData.map((v) => v.key).filter((k): k is string => k !== null)
    const existingKeys = await fetchExistingKeys(kind, organizationId, keysToCheck)

    const seenInFile = new Set<string>()
    const duplicateRows: DuplicateRow[] = []
    const sample: Record<string, unknown>[] = []

    for (const { rowIndex, data, key } of validData) {
      if (key !== null && existingKeys.has(key)) {
        duplicateRows.push({ rowIndex, reason: 'duplicate_in_org' })
        continue
      }
      if (key !== null && seenInFile.has(key)) {
        duplicateRows.push({ rowIndex, reason: 'duplicate_in_file' })
        continue
      }
      if (key !== null) seenInFile.add(key)
      if (sample.length < 20) sample.push(data)
    }

    return {
      success: true,
      total: rows.length,
      valid: rows.length - invalidRows.length - duplicateRows.length,
      invalidRows,
      duplicateRows,
      sample,
    }
  } catch (e) {
    return { success: false, error: (e as Error).message ?? 'Unexpected error' }
  }
}

export async function commitImport(input: ImportInput): Promise<CommitResult> {
  try {
    const ctx = await getOrgContext()
    if (!ctx) return { success: false, error: 'Authentication required' }
    const { userId, organizationId } = ctx

    const { kind, rows, mapping } = input

    if (rows.length > MAX_ROWS) {
      return { success: false, error: `Import is limited to ${MAX_ROWS} rows per file.` }
    }

    const spec = ENTITY_SPECS[kind]
    const mapped = applyMappingToRows(rows, mapping)

    // Re-validate server-side — never rely on client preview
    const errors: RowReport[] = []
    let skippedInvalid = 0
    const validData: { rowIndex: number; data: Record<string, unknown>; key: string | null }[] = []

    for (let i = 0; i < mapped.length; i++) {
      const result = validateRow(mapped[i], spec)
      if (!result.ok) {
        skippedInvalid++
        errors.push({ rowIndex: i, reason: result.errors.map((e) => e.message).join('; ') })
      } else {
        validData.push({ rowIndex: i, data: result.data, key: extractDedupeKey(kind, result.data) })
      }
    }

    // Batch dup check — org-scoped only
    const keysToCheck = validData.map((v) => v.key).filter((k): k is string => k !== null)
    const existingKeys = await fetchExistingKeys(kind, organizationId, keysToCheck)

    // For equipment, resolve customerEmail → customerId in one batch query
    let customerByEmail: Map<string, string> = new Map()
    if (kind === 'equipment') {
      const emails = validData
        .map((v) => {
          const e = v.data.customerEmail
          return typeof e === 'string' ? e.toLowerCase().trim() : ''
        })
        .filter(Boolean)
      if (emails.length > 0) {
        const customers = await db.customer.findMany({
          where: { organizationId, email: { in: emails, mode: 'insensitive' } },
          select: { id: true, email: true },
        })
        customerByEmail = new Map(
          customers.filter((c) => c.email).map((c) => [c.email!.toLowerCase(), c.id]),
        )
      }
    }

    // Partition: skip duplicates and customer-not-found; collect creates
    const seenInFile = new Set<string>()
    let skippedDuplicates = 0
    const toCreate: { rowIndex: number; data: Record<string, unknown> }[] = []

    for (const { rowIndex, data, key } of validData) {
      if (key !== null && (existingKeys.has(key) || seenInFile.has(key))) {
        skippedDuplicates++
        continue
      }
      if (key !== null) seenInFile.add(key)

      if (kind === 'equipment') {
        const email =
          typeof data.customerEmail === 'string' ? data.customerEmail.toLowerCase().trim() : ''
        const customerId = customerByEmail.get(email)
        if (!customerId) {
          errors.push({ rowIndex, reason: 'customer_not_found' })
          skippedInvalid++
          continue
        }
        toCreate.push({ rowIndex, data: { ...data, customerId } })
      } else {
        toCreate.push({ rowIndex, data })
      }
    }

    let created = 0

    await db.$transaction(async (tx) => {
      for (const { data } of toCreate) {
        if (kind === 'customers') {
          await tx.customer.create({
            data: {
              organizationId,
              firstName: data.firstName as string,
              lastName: (data.lastName as string | undefined) || null,
              companyName: (data.companyName as string | undefined) || null,
              email: (data.email as string | undefined) || null,
              phone: data.phone as string,
              addressLine1: (data.addressLine1 as string | undefined) || null,
              addressLine2: (data.addressLine2 as string | undefined) || null,
              city: (data.city as string | undefined) || null,
              state: (data.state as string | undefined) || null,
              postalCode: (data.postalCode as string | undefined) || null,
              notes: (data.notes as string | undefined) || null,
            },
          })
        } else if (kind === 'pricebook') {
          await tx.inventoryItem.create({
            data: {
              organizationId,
              name: data.name as string,
              sku: (data.sku as string | undefined) || null,
              description: (data.description as string | undefined) || null,
              unitCostCents: (data.unitCostCents as number | undefined) ?? 0,
              sellPriceCents: (data.sellPriceCents as number | undefined) ?? 0,
              quantityOnHand: (data.quantityOnHand as number | undefined) ?? 0,
              reorderPoint: (data.reorderPoint as number | undefined) ?? 0,
              category: (data.category as string | undefined) || null,
            },
          })
        } else {
          // equipment — customerId injected above
          await tx.equipment.create({
            data: {
              organizationId,
              customerId: data.customerId as string,
              type: data.type as string,
              make: (data.make as string | undefined) || null,
              model: (data.model as string | undefined) || null,
              serial: (data.serial as string | undefined) || null,
              installDate: data.installDate ? new Date(data.installDate as string) : null,
              tonnage: (data.tonnage as number | undefined) ?? null,
              seer: (data.seer as number | undefined) ?? null,
              btu: (data.btu as number | undefined) ?? null,
              locationOnProperty: (data.locationOnProperty as string | undefined) || null,
              notes: (data.notes as string | undefined) || null,
            },
          })
        }
        created++
      }
    })

    await trackEvent({
      organizationId,
      userId,
      eventName: 'csv_import_committed',
      entityType: kind,
      metadataJson: { created, skipped: skippedDuplicates + skippedInvalid },
    })

    await logAudit({
      organizationId,
      actorId: userId,
      eventType: 'csv_import',
      targetType: kind,
      metadata: { created, skipped: skippedDuplicates + skippedInvalid },
    })

    return { success: true, created, skippedDuplicates, skippedInvalid, errors }
  } catch (e) {
    return { success: false, error: (e as Error).message ?? 'Unexpected error' }
  }
}
