import { sanitizeMetadata } from '@/lib/audit'

export const EXPORT_ENTITIES = ['customers', 'jobs', 'invoices', 'payments', 'audit'] as const
export type ExportEntity = (typeof EXPORT_ENTITIES)[number]

function escape(v: unknown): string {
  const s = String(v ?? '')
  return s.includes(',') || s.includes('"') || s.includes('\n')
    ? `"${s.replace(/"/g, '""')}"`
    : s
}

export function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return ''
  const headers = Object.keys(rows[0])
  const lines = [headers.join(','), ...rows.map((r) => headers.map((h) => escape(r[h])).join(','))]
  return lines.join('\n')
}

export function flattenCustomer(row: {
  id: string
  firstName: string
  lastName: string | null
  companyName: string | null
  email: string | null
  phone: string | null
  city: string | null
  state: string | null
  createdAt: Date
}) {
  return {
    id: row.id,
    firstName: row.firstName,
    lastName: row.lastName ?? '',
    companyName: row.companyName ?? '',
    email: row.email ?? '',
    phone: row.phone ?? '',
    city: row.city ?? '',
    state: row.state ?? '',
    createdAt: row.createdAt.toISOString(),
  }
}

export function flattenJob(row: {
  id: string
  customerId: string
  title: string
  status: string
  scheduledFor: Date | null
  completedAt: Date | null
  createdAt: Date
}) {
  return {
    id: row.id,
    customerId: row.customerId,
    title: row.title,
    status: row.status,
    scheduledFor: row.scheduledFor?.toISOString() ?? '',
    completedAt: row.completedAt?.toISOString() ?? '',
    createdAt: row.createdAt.toISOString(),
  }
}

export function flattenInvoice(row: {
  id: string
  customerId: string
  jobId: string
  invoiceNumber: string
  status: string
  totalCents: number
  paidAt: Date | null
  createdAt: Date
}) {
  return {
    id: row.id,
    customerId: row.customerId,
    jobId: row.jobId,
    invoiceNumber: row.invoiceNumber,
    status: row.status,
    totalCents: row.totalCents,
    paidAt: row.paidAt?.toISOString() ?? '',
    createdAt: row.createdAt.toISOString(),
  }
}

export function flattenPayment(row: {
  id: string
  invoiceId: string
  amountCents: number
  currency: string
  method: string
  status: string
  paidAt: Date | null
  createdAt: Date
}) {
  return {
    id: row.id,
    invoiceId: row.invoiceId,
    amountCents: row.amountCents,
    currency: row.currency,
    method: row.method,
    status: row.status,
    paidAt: row.paidAt?.toISOString() ?? '',
    createdAt: row.createdAt.toISOString(),
  }
}

export function flattenAuditLog(row: {
  id: string
  createdAt: Date
  eventType: string
  actorEmail: string | null
  targetType: string | null
  targetId: string | null
  metadata: unknown
}) {
  const safe = sanitizeMetadata((row.metadata ?? {}) as Record<string, unknown>)
  return {
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    eventType: row.eventType,
    actorEmail: row.actorEmail ?? '',
    targetType: row.targetType ?? '',
    targetId: row.targetId ?? '',
    metadata: JSON.stringify(safe),
  }
}
