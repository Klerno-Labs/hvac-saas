import { db } from '@/lib/db'
import { sanitizeMetadata } from '@/lib/audit'

export type ExportEntity = 'customers' | 'jobs' | 'invoices' | 'payments' | 'audit'

export const EXPORT_ENTITIES: ExportEntity[] = [
  'customers',
  'jobs',
  'invoices',
  'payments',
  'audit',
]

type Row = Record<string, string | number | boolean | null>

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return ''
  const s = String(v)
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

function toCsv(rows: Row[]): string {
  if (rows.length === 0) return ''
  const headers = Object.keys(rows[0])
  return [
    headers.join(','),
    ...rows.map((row) => headers.map((h) => csvCell(row[h])).join(',')),
  ].join('\n')
}

export function flattenCustomer(c: {
  id: string
  createdAt: Date
  firstName: string
  lastName: string | null
  companyName: string | null
  email: string | null
  phone: string | null
  addressLine1: string | null
  addressLine2: string | null
  city: string | null
  state: string | null
  postalCode: string | null
}): Row {
  return {
    id: c.id,
    createdAt: c.createdAt.toISOString(),
    firstName: c.firstName,
    lastName: c.lastName ?? '',
    companyName: c.companyName ?? '',
    email: c.email ?? '',
    phone: c.phone ?? '',
    addressLine1: c.addressLine1 ?? '',
    addressLine2: c.addressLine2 ?? '',
    city: c.city ?? '',
    state: c.state ?? '',
    postalCode: c.postalCode ?? '',
  }
}

export function flattenJob(j: {
  id: string
  createdAt: Date
  customerId: string
  title: string
  status: string
  scheduledFor: Date | null
  completedAt: Date | null
  technicianName: string | null
}): Row {
  return {
    id: j.id,
    createdAt: j.createdAt.toISOString(),
    customerId: j.customerId,
    title: j.title,
    status: j.status,
    scheduledFor: j.scheduledFor?.toISOString() ?? '',
    completedAt: j.completedAt?.toISOString() ?? '',
    technicianName: j.technicianName ?? '',
  }
}

export function flattenInvoice(i: {
  id: string
  createdAt: Date
  customerId: string
  jobId: string
  invoiceNumber: string
  status: string
  subtotalCents: number
  taxCents: number
  totalCents: number
  outstandingCents: number
  dueDate: Date | null
  paidAt: Date | null
}): Row {
  return {
    id: i.id,
    createdAt: i.createdAt.toISOString(),
    customerId: i.customerId,
    jobId: i.jobId,
    invoiceNumber: i.invoiceNumber,
    status: i.status,
    subtotalCents: i.subtotalCents,
    taxCents: i.taxCents,
    totalCents: i.totalCents,
    outstandingCents: i.outstandingCents,
    dueDate: i.dueDate?.toISOString() ?? '',
    paidAt: i.paidAt?.toISOString() ?? '',
  }
}

export function flattenPayment(p: {
  id: string
  createdAt: Date
  invoiceId: string
  amountCents: number
  currency: string
  method: string
  status: string
  paidAt: Date | null
}): Row {
  return {
    id: p.id,
    createdAt: p.createdAt.toISOString(),
    invoiceId: p.invoiceId,
    amountCents: p.amountCents,
    currency: p.currency,
    method: p.method,
    status: p.status,
    paidAt: p.paidAt?.toISOString() ?? '',
  }
}

export function flattenAuditLog(log: {
  id: string
  createdAt: Date
  eventType: string
  actorEmail: string | null
  targetType: string | null
  targetId: string | null
  metadata: unknown
}): Row {
  const safeMetadata =
    log.metadata !== null &&
    log.metadata !== undefined &&
    typeof log.metadata === 'object' &&
    !Array.isArray(log.metadata)
      ? sanitizeMetadata(log.metadata as Record<string, unknown>)
      : {}
  return {
    id: log.id,
    createdAt: log.createdAt.toISOString(),
    eventType: log.eventType,
    actorEmail: log.actorEmail ?? '',
    targetType: log.targetType ?? '',
    targetId: log.targetId ?? '',
    metadata: JSON.stringify(safeMetadata),
  }
}

async function fetchRows(organizationId: string, entity: ExportEntity): Promise<Row[]> {
  switch (entity) {
    case 'customers': {
      const records = await db.customer.findMany({
        where: { organizationId, deletedAt: null },
        orderBy: { createdAt: 'asc' },
      })
      return records.map(flattenCustomer)
    }
    case 'jobs': {
      const records = await db.job.findMany({
        where: { organizationId },
        orderBy: { createdAt: 'asc' },
      })
      return records.map(flattenJob)
    }
    case 'invoices': {
      const records = await db.invoice.findMany({
        where: { organizationId },
        orderBy: { createdAt: 'asc' },
      })
      return records.map(flattenInvoice)
    }
    case 'payments': {
      const records = await db.payment.findMany({
        where: { organizationId },
        orderBy: { createdAt: 'asc' },
      })
      return records.map(flattenPayment)
    }
    case 'audit': {
      const records = await db.auditLog.findMany({
        where: { organizationId },
        orderBy: { createdAt: 'asc' },
      })
      return records.map(flattenAuditLog)
    }
    default: {
      const _exhaustive: never = entity
      throw new Error(`Unknown export entity: ${_exhaustive}`)
    }
  }
}

export async function exportData(
  organizationId: string,
  entity: ExportEntity,
  format: 'csv' | 'json',
): Promise<{ data: string; filename: string; contentType: string }> {
  const rows = await fetchRows(organizationId, entity)
  const data = format === 'json' ? JSON.stringify(rows, null, 2) : toCsv(rows)
  return {
    data,
    filename: `${entity}-export.${format}`,
    contentType: format === 'json' ? 'application/json' : 'text/csv',
  }
}
