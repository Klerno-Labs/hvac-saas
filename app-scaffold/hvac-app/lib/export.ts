export const EXPORT_ENTITIES = ['customers', 'jobs', 'invoices', 'payments'] as const
export type ExportEntity = typeof EXPORT_ENTITIES[number]

export function isExportEntity(s: string): s is ExportEntity {
  return (EXPORT_ENTITIES as readonly string[]).includes(s)
}

/**
 * RFC-4180-safe CSV serialization.
 * Empty rows → returns '' (no header row, since there are no keys to derive one from).
 * Line endings are CRLF per RFC-4180.
 */
export function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return ''

  // Stable key order: first-seen across all rows
  const keySet = new Set<string>()
  for (const row of rows) {
    for (const k of Object.keys(row)) keySet.add(k)
  }
  const keys = Array.from(keySet)

  const lines: string[] = [keys.join(',')]
  for (const row of rows) {
    lines.push(keys.map((k) => escapeField(row[k])).join(','))
  }
  return lines.join('\r\n')
}

function escapeField(val: unknown): string {
  const s = val === null || val === undefined ? '' : String(val)
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return '"' + s.replace(/"/g, '""') + '"'
  }
  return s
}

export function flattenCustomer(row: Record<string, unknown>): Record<string, string | number | null> {
  return {
    id: str(row.id),
    firstName: str(row.firstName),
    lastName: str(row.lastName),
    companyName: str(row.companyName),
    email: str(row.email),
    phone: str(row.phone),
    addressLine1: str(row.addressLine1),
    addressLine2: str(row.addressLine2),
    city: str(row.city),
    state: str(row.state),
    postalCode: str(row.postalCode),
    notes: str(row.notes),
    createdAt: iso(row.createdAt),
  }
}

export function flattenJob(row: Record<string, unknown>): Record<string, string | number | null> {
  return {
    id: str(row.id),
    customerId: str(row.customerId),
    title: str(row.title),
    status: str(row.status),
    scheduledFor: iso(row.scheduledFor),
    completedAt: iso(row.completedAt),
    technicianName: str(row.technicianName),
  }
}

export function flattenInvoice(row: Record<string, unknown>): Record<string, string | number | null> {
  return {
    id: str(row.id),
    customerId: str(row.customerId),
    jobId: str(row.jobId),
    invoiceNumber: str(row.invoiceNumber),
    status: str(row.status),
    subtotalCents: int(row.subtotalCents),
    taxCents: int(row.taxCents),
    totalCents: int(row.totalCents),
    outstandingCents: int(row.outstandingCents),
    dueDate: iso(row.dueDate),
    paidAt: iso(row.paidAt),
    createdAt: iso(row.createdAt),
  }
}

export function flattenPayment(row: Record<string, unknown>): Record<string, string | number | null> {
  return {
    id: str(row.id),
    invoiceId: str(row.invoiceId),
    amountCents: int(row.amountCents),
    currency: str(row.currency),
    status: str(row.status),
    paidAt: iso(row.paidAt),
    createdAt: iso(row.createdAt),
  }
}

function str(v: unknown): string | null {
  if (v === null || v === undefined) return null
  return String(v)
}

function iso(v: unknown): string | null {
  if (v === null || v === undefined) return null
  if (v instanceof Date) return v.toISOString()
  if (typeof v === 'string') return v
  return null
}

function int(v: unknown): number | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'number') return v
  return null
}
