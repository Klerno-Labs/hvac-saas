'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { trackEvent } from '@/lib/events'
import { logAudit } from '@/lib/audit'
import { getEntitySpec, type ImportEntityType } from '@/lib/csv-import/specs'
import { validateRow } from '@/lib/csv-import/validate'

export type EntityKind = ImportEntityType

type ImportInput = {
  kind: EntityKind
  rows: Record<string, string>[]
  mapping: Record<string, string | null>
}

export type InvalidRow = { rowIndex: number; errors: string[] }
export type DuplicateRow = { rowIndex: number; reason: string }
export type PerRowError = { rowIndex: number; reason: string }

export type PreviewResult =
  | {
      success: true
      total: number
      valid: number
      invalidRows: InvalidRow[]
      duplicateRows: DuplicateRow[]
      sample: Record<string, unknown>[]
    }
  | { success: false; error: string }

export type CommitResult =
  | {
      success: true
      created: number
      skippedDuplicates: number
      skippedInvalid: number
      errors: PerRowError[]
    }
  | { success: false; error: string }

async function resolveSession(): Promise<
  { userId: string; organizationId: string } | { error: string }
> {
  const session = await auth()
  if (!session?.user?.id) return { error: 'You must be logged in' }
  const userId = session.user.id
  const membership = await db.organizationMember.findFirst({ where: { userId } })
  if (!membership) return { error: 'You must belong to an organization' }
  return { userId, organizationId: membership.organizationId }
}

function applyMapping(
  row: Record<string, string>,
  mapping: Record<string, string | null>,
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [fieldKey, header] of Object.entries(mapping)) {
    if (!header) continue
    const val = row[header]
    if (val !== undefined) out[fieldKey] = val
  }
  return out
}

function getDupeKey(kind: EntityKind, mapped: Record<string, string>): string | null {
  if (kind === 'customers') {
    const v = (mapped.email ?? '').trim().toLowerCase()
    return v || null
  }
  if (kind === 'pricebook') {
    const v = (mapped.sku ?? '').trim()
    return v || null
  }
  if (kind === 'equipment') {
    const v = (mapped.serial ?? '').trim()
    return v || null
  }
  return null
}

async function getExistingKeys(
  kind: EntityKind,
  keys: string[],
  organizationId: string,
): Promise<Set<string>> {
  if (keys.length === 0) return new Set()
  if (kind === 'customers') {
    const found = await db.customer.findMany({
      where: { organizationId, email: { in: keys } },
      select: { email: true },
    })
    return new Set(found.map((r) => (r.email ?? '').toLowerCase()).filter(Boolean))
  }
  if (kind === 'pricebook') {
    const found = await db.inventoryItem.findMany({
      where: { organizationId, sku: { in: keys } },
      select: { sku: true },
    })
    return new Set(found.map((r) => r.sku ?? '').filter(Boolean))
  }
  if (kind === 'equipment') {
    const found = await db.equipment.findMany({
      where: { organizationId, serial: { in: keys } },
      select: { serial: true },
    })
    return new Set(found.map((r) => r.serial ?? '').filter(Boolean))
  }
  return new Set()
}

export async function previewImport(input: ImportInput): Promise<PreviewResult> {
  try {
    const ctx = await resolveSession()
    if ('error' in ctx) return { success: false, error: ctx.error }
    const { organizationId } = ctx

    const { kind, rows, mapping } = input
    const spec = getEntitySpec(kind)
    const mappedRows = rows.map((r) => applyMapping(r, mapping))

    const dupeKeys = mappedRows
      .map((r) => getDupeKey(kind, r))
      .filter((k): k is string => k !== null)
    const existingKeys = await getExistingKeys(kind, dupeKeys, organizationId)

    const invalidRows: InvalidRow[] = []
    const duplicateRows: DuplicateRow[] = []
    const sample: Record<string, unknown>[] = []
    const inFileKeys = new Set<string>()
    let valid = 0

    for (let i = 0; i < mappedRows.length; i++) {
      const mapped = mappedRows[i]
      const key = getDupeKey(kind, mapped)

      if (key && inFileKeys.has(key)) {
        duplicateRows.push({ rowIndex: i, reason: 'in_file_duplicate' })
        continue
      }
      if (key) inFileKeys.add(key)

      if (key && existingKeys.has(key)) {
        duplicateRows.push({ rowIndex: i, reason: 'already_exists' })
        continue
      }

      const result = validateRow(mapped, spec)
      if (!result.ok) {
        invalidRows.push({ rowIndex: i, errors: result.errors.map((e) => e.message) })
      } else {
        valid++
        if (sample.length < 20) sample.push(result.data)
      }
    }

    return { success: true, total: rows.length, valid, invalidRows, duplicateRows, sample }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unexpected error' }
  }
}

export async function commitImport(input: ImportInput): Promise<CommitResult> {
  try {
    const ctx = await resolveSession()
    if ('error' in ctx) return { success: false, error: ctx.error }
    const { userId, organizationId } = ctx

    const { kind, rows, mapping } = input

    if (rows.length > 5000) {
      return {
        success: false,
        error: 'Import exceeds 5000-row limit. Split into smaller batches.',
      }
    }

    const spec = getEntitySpec(kind)
    const mappedRows = rows.map((r) => applyMapping(r, mapping))

    const dupeKeys = mappedRows
      .map((r) => getDupeKey(kind, r))
      .filter((k): k is string => k !== null)
    const existingKeys = await getExistingKeys(kind, dupeKeys, organizationId)

    const customerEmailToId = new Map<string, string>()
    if (kind === 'equipment') {
      const emails = mappedRows
        .map((r) => (r.customerEmail ?? '').trim().toLowerCase())
        .filter(Boolean)
      if (emails.length > 0) {
        const customers = await db.customer.findMany({
          where: { organizationId, email: { in: emails } },
          select: { id: true, email: true },
        })
        for (const c of customers) {
          if (c.email) customerEmailToId.set(c.email.toLowerCase(), c.id)
        }
      }
    }

    type CustomerOp = { kind: 'customers'; data: Record<string, unknown> }
    type PricebookOp = { kind: 'pricebook'; data: Record<string, unknown> }
    type EquipmentOp = { kind: 'equipment'; data: Record<string, unknown>; customerId: string }
    type Op = CustomerOp | PricebookOp | EquipmentOp

    const ops: Op[] = []
    const errors: PerRowError[] = []
    const inFileKeys = new Set<string>()
    let skippedDuplicates = 0
    let skippedInvalid = 0

    for (let i = 0; i < mappedRows.length; i++) {
      const mapped = mappedRows[i]
      const key = getDupeKey(kind, mapped)

      if (key && inFileKeys.has(key)) {
        skippedDuplicates++
        continue
      }
      if (key) inFileKeys.add(key)

      if (key && existingKeys.has(key)) {
        skippedDuplicates++
        continue
      }

      const result = validateRow(mapped, spec)
      if (!result.ok) {
        skippedInvalid++
        errors.push({ rowIndex: i, reason: result.errors.map((e) => e.message).join('; ') })
        continue
      }

      if (kind === 'equipment') {
        const email = (mapped.customerEmail ?? '').trim().toLowerCase()
        const customerId = email ? customerEmailToId.get(email) : undefined
        if (!customerId) {
          skippedInvalid++
          errors.push({ rowIndex: i, reason: 'customer_not_found' })
          continue
        }
        const { customerEmail: _ce, customerPhone: _cp, ...equipmentData } =
          result.data as Record<string, unknown>
        ops.push({ kind: 'equipment', data: equipmentData, customerId })
      } else if (kind === 'customers') {
        ops.push({ kind: 'customers', data: result.data })
      } else {
        ops.push({ kind: 'pricebook', data: result.data })
      }
    }

    const created = ops.length

    await db.$transaction(async (tx) => {
      for (const op of ops) {
        if (op.kind === 'customers') {
          const d = op.data
          await tx.customer.create({
            data: {
              organizationId,
              firstName: d.firstName as string,
              lastName: (d.lastName as string) || null,
              companyName: (d.companyName as string) || null,
              email: (d.email as string) || null,
              phone: (d.phone as string) || null,
              addressLine1: (d.addressLine1 as string) || null,
              addressLine2: (d.addressLine2 as string) || null,
              city: (d.city as string) || null,
              state: (d.state as string) || null,
              postalCode: (d.postalCode as string) || null,
              notes: (d.notes as string) || null,
            },
          })
        } else if (op.kind === 'pricebook') {
          const d = op.data
          await tx.inventoryItem.create({
            data: {
              organizationId,
              name: d.name as string,
              sku: (d.sku as string) || null,
              description: (d.description as string) || null,
              unitCostCents: (d.unitCostCents as number) ?? 0,
              sellPriceCents: (d.sellPriceCents as number) ?? 0,
              quantityOnHand: (d.quantityOnHand as number) ?? 0,
              reorderPoint: (d.reorderPoint as number) ?? 0,
              category: (d.category as string) || null,
            },
          })
        } else {
          const d = op.data
          await tx.equipment.create({
            data: {
              organizationId,
              customerId: op.customerId,
              type: d.type as string,
              make: (d.make as string) || null,
              model: (d.model as string) || null,
              serial: (d.serial as string) || null,
              installDate: d.installDate ? new Date(d.installDate as string) : null,
              tonnage: d.tonnage != null ? (d.tonnage as number) : null,
              seer: d.seer != null ? (d.seer as number) : null,
              btu: d.btu != null ? (d.btu as number) : null,
              locationOnProperty: (d.locationOnProperty as string) || null,
              notes: (d.notes as string) || null,
            },
          })
        }
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
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unexpected error' }
  }
}
