export const EXPORT_ENTITIES = ['customers', 'jobs', 'invoices', 'payments'] as const
export type ExportEntity = (typeof EXPORT_ENTITIES)[number]

export function isValidEntity(entity: string): entity is ExportEntity {
  return (EXPORT_ENTITIES as readonly string[]).includes(entity)
}

function csvField(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value)
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return '"' + s.replace(/"/g, '""') + '"'
  }
  return s
}

/**
 * Converts rows to RFC-4180 CSV (CRLF line endings).
 * Empty input returns '' — no header row, since there are no keys to derive one from.
 */
export function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return ''

  // Stable key order: first-seen insertion order across all rows
  const keySet = new Set<string>()
  for (const row of rows) {
    for (const key of Object.keys(row)) keySet.add(key)
  }
  const keys = [...keySet]

  const lines: string[] = [keys.map(csvField).join(',')]
  for (const row of rows) {
    lines.push(keys.map(k => csvField(row[k])).join(','))
  }
  return lines.join('\r\n')
}

interface CustomerRow {
  id: string
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
  notes: string | null
  createdAt: Date
}

export function flattenCustomer(row: CustomerRow): Record<string, string | number | null> {
  return {
    id: row.id,
    firstName: row.firstName,
    lastName: row.lastName,
    companyName: row.companyName,
    email: row.email,
    phone: row.phone,
    addressLine1: row.addressLine1,
    addressLine2: row.addressLine2,
    city: row.city,
    state: row.state,
    postalCode: row.postalCode,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
  }
}

interface JobRow {
  id: string
  customerId: string
  title: string
  status: string
  scheduledFor: Date | null
  completedAt: Date | null
  technicianName: string | null
}

export function flattenJob(row: JobRow): Record<string, string | number | null> {
  return {
    id: row.id,
    customerId: row.customerId,
    title: row.title,
    status: row.status,
    scheduledFor: row.scheduledFor ? row.scheduledFor.toISOString() : null,
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    technicianName: row.technicianName,
  }
}

interface InvoiceRow {
  id: string
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
  createdAt: Date
}

export function flattenInvoice(row: InvoiceRow): Record<string, string | number | null> {
  return {
    id: row.id,
    customerId: row.customerId,
    jobId: row.jobId,
    invoiceNumber: row.invoiceNumber,
    status: row.status,
    subtotalCents: row.subtotalCents,
    taxCents: row.taxCents,
    totalCents: row.totalCents,
    outstandingCents: row.outstandingCents,
    dueDate: row.dueDate ? row.dueDate.toISOString() : null,
    paidAt: row.paidAt ? row.paidAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  }
}

interface PaymentRow {
  id: string
  invoiceId: string
  amountCents: number
  currency: string
  status: string
  paidAt: Date | null
  createdAt: Date
}

export function flattenPayment(row: PaymentRow): Record<string, string | number | null> {
  return {
    id: row.id,
    invoiceId: row.invoiceId,
    amountCents: row.amountCents,
    currency: row.currency,
    status: row.status,
    paidAt: row.paidAt ? row.paidAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  }
}
