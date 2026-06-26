'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { trackEvent } from '@/lib/events'
import { getEntitySpec, type ImportEntityType } from '@/lib/csv-import/specs'
import { validateRows } from '@/lib/csv-import/validate'

export type RowReport = {
  index: number
  status: 'valid' | 'duplicate' | 'invalid'
  reason?: string
  data: Record<string, string>
}

export type PreviewResult =
  | { success: true; total: number; valid: number; duplicates: number; invalid: number; preview: RowReport[] }
  | { success: false; error: string }

export type CommitResult =
  | { success: true; created: number; skippedDuplicates: number; skippedInvalid: number }
  | { success: false; error: string }

async function resolveOrg(): Promise<{ organizationId: string; userId: string } | null> {
  const session = await auth()
  if (!session?.user?.id) return null
  const membership = await db.organizationMember.findFirst({ where: { userId: session.user.id } })
  if (!membership) return null
  return { organizationId: membership.organizationId, userId: session.user.id }
}

async function fetchExistingDedupeSet(
  kind: ImportEntityType,
  organizationId: string,
  values: string[],
): Promise<Set<string>> {
  const s = new Set<string>()
  if (!values.length) return s

  if (kind === 'customers') {
    const rows = await db.customer.findMany({
      where: { organizationId, email: { in: values, mode: 'insensitive' }, deletedAt: null },
      select: { email: true },
    })
    rows.forEach((r) => r.email && s.add(r.email.toLowerCase()))
  } else if (kind === 'pricebook') {
    const rows = await db.inventoryItem.findMany({
      where: { organizationId, sku: { in: values, mode: 'insensitive' } },
      select: { sku: true },
    })
    rows.forEach((r) => r.sku && s.add(r.sku.toLowerCase()))
  } else if (kind === 'equipment') {
    const rows = await db.equipment.findMany({
      where: { organizationId, serial: { in: values, mode: 'insensitive' } },
      select: { serial: true },
    })
    rows.forEach((r) => r.serial && s.add(r.serial.toLowerCase()))
  }

  return s
}

function classifyRows(
  validated: ReturnType<typeof validateRows>,
  dedupeKey: string | null,
  existingSet: Set<string>,
): RowReport[] {
  return validated.map((result, index) => {
    if (!result.ok) {
      return {
        index,
        status: 'invalid' as const,
        reason: result.errors.map((e) => e.message).join('; '),
        data: result.raw,
      }
    }
    if (dedupeKey) {
      const val = result.raw[dedupeKey]
      if (val && existingSet.has(val.toLowerCase())) {
        return {
          index,
          status: 'duplicate' as const,
          reason: `${dedupeKey} "${val}" already exists`,
          data: result.raw,
        }
      }
    }
    return { index, status: 'valid' as const, data: result.raw }
  })
}

export async function previewImport(input: {
  kind: ImportEntityType
  rows: Record<string, string>[]
}): Promise<PreviewResult> {
  const ctx = await resolveOrg()
  if (!ctx) return { success: false, error: 'Not authenticated' }

  const spec = getEntitySpec(input.kind)
  const validated = validateRows(input.rows, spec)

  const dedupeValues = spec.dedupeKey
    ? validated
        .filter((r) => r.ok && spec.dedupeKey && r.raw[spec.dedupeKey])
        .map((r) => (r.ok && spec.dedupeKey ? r.raw[spec.dedupeKey] : ''))
        .filter(Boolean)
    : []

  const existingSet = await fetchExistingDedupeSet(input.kind, ctx.organizationId, dedupeValues)
  const report = classifyRows(validated, spec.dedupeKey, existingSet)

  return {
    success: true,
    total: report.length,
    valid: report.filter((r) => r.status === 'valid').length,
    duplicates: report.filter((r) => r.status === 'duplicate').length,
    invalid: report.filter((r) => r.status === 'invalid').length,
    preview: report.slice(0, 20),
  }
}

export async function commitImport(input: {
  kind: ImportEntityType
  rows: Record<string, string>[]
}): Promise<CommitResult> {
  const ctx = await resolveOrg()
  if (!ctx) return { success: false, error: 'Not authenticated' }
  const { organizationId, userId } = ctx

  const spec = getEntitySpec(input.kind)
  const validated = validateRows(input.rows, spec)

  const dedupeValues = spec.dedupeKey
    ? validated
        .filter((r) => r.ok && spec.dedupeKey && r.raw[spec.dedupeKey])
        .map((r) => (r.ok && spec.dedupeKey ? r.raw[spec.dedupeKey] : ''))
        .filter(Boolean)
    : []

  const existingSet = await fetchExistingDedupeSet(input.kind, ctx.organizationId, dedupeValues)
  const report = classifyRows(validated, spec.dedupeKey, existingSet)

  let created = 0
  let skippedDuplicates = 0
  let skippedInvalid = 0

  // For equipment: resolve customers once before the loop.
  let emailToCustomerId = new Map<string, string>()
  let phoneToCustomerId = new Map<string, string>()
  if (input.kind === 'equipment') {
    const validData = validated.filter((r) => r.ok).map((r) => (r.ok ? r.data : null)).filter(Boolean) as Record<string, unknown>[]
    const emails = validData.map((d) => d.customerEmail as string | undefined).filter((e): e is string => !!e && e !== '')
    const phones = validData.map((d) => d.customerPhone as string | undefined).filter((p): p is string => !!p && p !== '')

    const [byEmail, byPhone] = await Promise.all([
      emails.length
        ? db.customer.findMany({ where: { organizationId, email: { in: emails, mode: 'insensitive' }, deletedAt: null }, select: { id: true, email: true } })
        : Promise.resolve([]),
      phones.length
        ? db.customer.findMany({ where: { organizationId, phone: { in: phones } }, select: { id: true, phone: true } })
        : Promise.resolve([]),
    ])
    byEmail.forEach((c) => c.email && emailToCustomerId.set(c.email.toLowerCase(), c.id))
    byPhone.forEach((c) => c.phone && phoneToCustomerId.set(c.phone, c.id))
  }

  const seenDedupeVals = new Set<string>()

  for (let i = 0; i < report.length; i++) {
    const r = report[i]
    if (r.status === 'duplicate') { skippedDuplicates++; continue }
    if (r.status === 'invalid') { skippedInvalid++; continue }

    const v = validated[i]
    if (!v.ok) { skippedInvalid++; continue }
    const d = v.data

    // Batch-level deduplication (two rows with same dedupe key).
    if (spec.dedupeKey) {
      const rawVal = r.data[spec.dedupeKey]
      if (rawVal) {
        const key = rawVal.toLowerCase()
        if (seenDedupeVals.has(key)) { skippedDuplicates++; continue }
        seenDedupeVals.add(key)
      }
    }

    try {
      if (input.kind === 'customers') {
        const customer = await db.customer.create({
          data: {
            organizationId,
            firstName: d.firstName as string,
            lastName: (d.lastName as string | undefined) || null,
            companyName: (d.companyName as string | undefined) || null,
            email: (d.email as string | undefined) || null,
            phone: (d.phone as string | undefined) || null,
            addressLine1: (d.addressLine1 as string | undefined) || null,
            addressLine2: (d.addressLine2 as string | undefined) || null,
            city: (d.city as string | undefined) || null,
            state: (d.state as string | undefined) || null,
            postalCode: (d.postalCode as string | undefined) || null,
            notes: (d.notes as string | undefined) || null,
          },
        })
        await trackEvent({ organizationId, userId, eventName: 'customer_created', entityType: 'customer', entityId: customer.id, metadataJson: { source: 'import' } })
        created++
      } else if (input.kind === 'pricebook') {
        const item = await db.inventoryItem.create({
          data: {
            organizationId,
            name: d.name as string,
            sku: (d.sku as string | undefined) || null,
            description: (d.description as string | undefined) || null,
            unitCostCents: typeof d.unitCostCents === 'number' ? d.unitCostCents : 0,
            sellPriceCents: typeof d.sellPriceCents === 'number' ? d.sellPriceCents : 0,
            quantityOnHand: typeof d.quantityOnHand === 'number' ? d.quantityOnHand : 0,
            reorderPoint: typeof d.reorderPoint === 'number' ? d.reorderPoint : 0,
            category: (d.category as string | undefined) || null,
          },
        })
        await trackEvent({ organizationId, userId, eventName: 'inventory_item_created', entityType: 'inventory_item', entityId: item.id, metadataJson: { source: 'import' } })
        created++
      } else if (input.kind === 'equipment') {
        const emailKey = (d.customerEmail as string | undefined)?.toLowerCase()
        const phoneKey = d.customerPhone as string | undefined
        const customerId =
          (emailKey && emailToCustomerId.get(emailKey)) ||
          (phoneKey && phoneToCustomerId.get(phoneKey)) ||
          null

        if (!customerId) {
          skippedInvalid++
          continue
        }

        const installDate = d.installDate ? new Date(d.installDate as string) : null
        const equipment = await db.equipment.create({
          data: {
            organizationId,
            customerId,
            type: d.type as string,
            make: (d.make as string | undefined) || null,
            model: (d.model as string | undefined) || null,
            serial: (d.serial as string | undefined) || null,
            installDate: installDate && !isNaN(installDate.getTime()) ? installDate : null,
            tonnage: typeof d.tonnage === 'number' ? d.tonnage : null,
            seer: typeof d.seer === 'number' ? d.seer : null,
            btu: typeof d.btu === 'number' ? d.btu : null,
            locationOnProperty: (d.locationOnProperty as string | undefined) || null,
            notes: (d.notes as string | undefined) || null,
          },
        })
        await trackEvent({ organizationId, userId, eventName: 'equipment_added', entityType: 'equipment', entityId: equipment.id, metadataJson: { source: 'import', customerId } })
        created++
      }
    } catch {
      skippedInvalid++
    }
  }

  return { success: true, created, skippedDuplicates, skippedInvalid }
}
