'use server'

import { requireAuth } from '@/lib/session'
import { db } from '@/lib/db'
import { getEntitySpec, type ImportEntityType, type Mapping } from '@/lib/csv-import/specs'
import { validateRows } from '@/lib/csv-import/validate'
import { trackEvent } from '@/lib/events'

export type RowReport = {
  index: number
  raw: Record<string, string>
  status: 'valid' | 'duplicate' | 'invalid'
  reason?: string
}

export type PreviewResult =
  | { success: false; error: string }
  | {
      success: true
      total: number
      valid: number
      duplicates: number
      invalid: number
      preview: RowReport[]
    }

export type CommitResult =
  | { success: false; error: string }
  | { success: true; created: number; skippedDuplicates: number; skippedInvalid: number }

export async function previewImport(input: {
  kind: ImportEntityType
  rows: Record<string, string>[]
  mapping: Mapping
}): Promise<PreviewResult> {
  const { organizationId } = await requireAuth()
  const { kind, rows } = input

  if (rows.length === 0) {
    return { success: true, total: 0, valid: 0, duplicates: 0, invalid: 0, preview: [] }
  }

  const spec = getEntitySpec(kind)
  const validated = validateRows(rows, spec)
  const dupeSet = await buildDupeSet(kind, organizationId, rows, spec.dedupeKey)

  const reports: RowReport[] = validated.map((v, i) => {
    if (!v.ok) {
      return {
        index: i,
        raw: v.raw,
        status: 'invalid' as const,
        reason: v.errors.map((e) => e.message).join('; '),
      }
    }
    const dedupeVal = spec.dedupeKey ? (v.raw[spec.dedupeKey] ?? '').toLowerCase() : ''
    if (dedupeVal && dupeSet.has(dedupeVal)) {
      return {
        index: i,
        raw: v.raw,
        status: 'duplicate' as const,
        reason: `Already exists (${spec.dedupeKey}: "${v.raw[spec.dedupeKey]}")`,
      }
    }
    return { index: i, raw: v.raw, status: 'valid' as const }
  })

  const valid = reports.filter((r) => r.status === 'valid').length
  const duplicates = reports.filter((r) => r.status === 'duplicate').length
  const invalid = reports.filter((r) => r.status === 'invalid').length

  return {
    success: true,
    total: rows.length,
    valid,
    duplicates,
    invalid,
    preview: reports.slice(0, 20),
  }
}

export async function commitImport(input: {
  kind: ImportEntityType
  rows: Record<string, string>[]
  mapping: Mapping
}): Promise<CommitResult> {
  const { organizationId, userId } = await requireAuth()
  const { kind, rows } = input

  if (rows.length === 0) {
    return { success: true, created: 0, skippedDuplicates: 0, skippedInvalid: 0 }
  }

  const spec = getEntitySpec(kind)
  const validated = validateRows(rows, spec)
  const dupeSet = await buildDupeSet(kind, organizationId, rows, spec.dedupeKey)
  const insertedKeys = new Set<string>()

  let created = 0
  let skippedDuplicates = 0
  let skippedInvalid = 0

  for (const v of validated) {
    if (!v.ok) {
      skippedInvalid++
      continue
    }
    const dedupeVal = spec.dedupeKey ? (v.raw[spec.dedupeKey] ?? '').toLowerCase() : ''
    if (dedupeVal && (dupeSet.has(dedupeVal) || insertedKeys.has(dedupeVal))) {
      skippedDuplicates++
      continue
    }
    try {
      await insertRow(kind, organizationId, v.data)
      if (dedupeVal) insertedKeys.add(dedupeVal)
      created++
    } catch {
      skippedInvalid++
    }
  }

  await trackEvent({
    organizationId,
    userId,
    eventName: 'bulk_import_completed',
    entityType: 'import',
    metadataJson: { kind, created, skippedDuplicates, skippedInvalid },
  })

  return { success: true, created, skippedDuplicates, skippedInvalid }
}

async function buildDupeSet(
  kind: ImportEntityType,
  organizationId: string,
  rows: Record<string, string>[],
  dedupeKey: string | null,
): Promise<Set<string>> {
  if (!dedupeKey) return new Set()
  const values = rows.map((r) => r[dedupeKey]?.trim().toLowerCase()).filter(Boolean) as string[]
  if (!values.length) return new Set()

  if (kind === 'customers') {
    const existing = await db.customer.findMany({
      where: { organizationId, email: { in: values } },
      select: { email: true },
    })
    return new Set(existing.map((c) => c.email?.toLowerCase() ?? '').filter(Boolean))
  }
  if (kind === 'pricebook') {
    const existing = await db.inventoryItem.findMany({
      where: { organizationId, sku: { in: values } },
      select: { sku: true },
    })
    return new Set(existing.map((i) => i.sku?.toLowerCase() ?? '').filter(Boolean))
  }
  if (kind === 'equipment') {
    const existing = await db.equipment.findMany({
      where: { organizationId, serial: { in: values } },
      select: { serial: true },
    })
    return new Set(existing.map((e) => e.serial?.toLowerCase() ?? '').filter(Boolean))
  }
  return new Set()
}

async function insertRow(
  kind: ImportEntityType,
  organizationId: string,
  data: Record<string, unknown>,
): Promise<void> {
  if (kind === 'customers') {
    await db.customer.create({
      data: {
        organizationId,
        firstName: data.firstName as string,
        lastName: (data.lastName as string) || null,
        companyName: (data.companyName as string) || null,
        email: (data.email as string) || null,
        phone: data.phone as string,
        addressLine1: (data.addressLine1 as string) || null,
        addressLine2: (data.addressLine2 as string) || null,
        city: (data.city as string) || null,
        state: (data.state as string) || null,
        postalCode: (data.postalCode as string) || null,
        notes: (data.notes as string) || null,
      },
    })
    return
  }
  if (kind === 'pricebook') {
    await db.inventoryItem.create({
      data: {
        organizationId,
        name: data.name as string,
        sku: (data.sku as string) || null,
        description: (data.description as string) || null,
        unitCostCents: (data.unitCostCents as number) ?? 0,
        sellPriceCents: (data.sellPriceCents as number) ?? 0,
        quantityOnHand: (data.quantityOnHand as number) ?? 0,
        reorderPoint: (data.reorderPoint as number) ?? 0,
        category: (data.category as string) || null,
      },
    })
    return
  }
  if (kind === 'equipment') {
    const customerEmail = (data.customerEmail as string) || null
    const customerPhone = (data.customerPhone as string) || null
    const conditions: ({ email: string } | { phone: string })[] = []
    if (customerEmail) conditions.push({ email: customerEmail })
    if (customerPhone) conditions.push({ phone: customerPhone })
    if (!conditions.length) throw new Error('No customer identifier (email or phone) provided')

    const customer = await db.customer.findFirst({
      where: { organizationId, OR: conditions },
      select: { id: true },
    })
    if (!customer) throw new Error('No matching customer found for the provided email/phone')

    const installDateRaw = data.installDate as string | undefined
    await db.equipment.create({
      data: {
        organizationId,
        customerId: customer.id,
        type: data.type as string,
        make: (data.make as string) || null,
        model: (data.model as string) || null,
        serial: (data.serial as string) || null,
        installDate: installDateRaw ? new Date(installDateRaw) : null,
        tonnage: (data.tonnage as number | undefined) ?? null,
        seer: (data.seer as number | undefined) ?? null,
        btu: (data.btu as number | undefined) ?? null,
        locationOnProperty: (data.locationOnProperty as string) || null,
        notes: (data.notes as string) || null,
      },
    })
  }
}
