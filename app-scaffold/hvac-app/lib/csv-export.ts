import Papa from 'papaparse'

/**
 * Org-scoped data export — the inverse of `lib/csv-import`. Serializes the
 * organization's own records (customers / jobs / invoices / payments) to CSV
 * or JSON for portability and trust. All row selection happens server-side
 * (see `app/settings/export/actions.ts`) and is scoped by organizationId; this
 * module only handles pure serialization of plain row objects, so it is fully
 * unit-testable without a database.
 *
 * Amounts are emitted in cents (the DB source of truth) with explicit `Cents`
 * column names to avoid ambiguity. CSV output is RFC-4180 compliant via
 * papaparse (mirroring `parseCsv`'s use of papaparse on the import side).
 */

export type ExportFormat = 'csv' | 'json'
export type ExportEntity = 'customers' | 'jobs' | 'invoices' | 'payments'

export type Row = Record<string, unknown>
export type Cell = string | number | boolean | null

export type Column = {
  /** Output column key (also used as the CSV header). */
  key: string
  /** Human label rendered in the picker UI. */
  label: string
  /** Pull a scalar cell value from a raw row. */
  from: (row: Row) => Cell
}

export type EntitySpec = {
  key: ExportEntity
  label: string
  description: string
  columns: Column[]
}

const iso = (v: unknown): string | null =>
  v instanceof Date ? v.toISOString() : v == null ? null : String(v)

const str = (v: unknown): string | null => (v == null ? null : String(v))

const CUSTOMER_COLUMNS: Column[] = [
  { key: 'id', label: 'ID', from: (r) => str(r.id) },
  { key: 'firstName', label: 'First name', from: (r) => str(r.firstName) },
  { key: 'lastName', label: 'Last name', from: (r) => str(r.lastName) },
  { key: 'companyName', label: 'Company', from: (r) => str(r.companyName) },
  { key: 'email', label: 'Email', from: (r) => str(r.email) },
  { key: 'phone', label: 'Phone', from: (r) => str(r.phone) },
  { key: 'addressLine1', label: 'Address line 1', from: (r) => str(r.addressLine1) },
  { key: 'addressLine2', label: 'Address line 2', from: (r) => str(r.addressLine2) },
  { key: 'city', label: 'City', from: (r) => str(r.city) },
  { key: 'state', label: 'State', from: (r) => str(r.state) },
  { key: 'postalCode', label: 'Postal code', from: (r) => str(r.postalCode) },
  { key: 'notes', label: 'Notes', from: (r) => str(r.notes) },
  { key: 'createdAt', label: 'Created at', from: (r) => iso(r.createdAt) },
  { key: 'updatedAt', label: 'Updated at', from: (r) => iso(r.updatedAt) },
]

const JOB_COLUMNS: Column[] = [
  { key: 'id', label: 'ID', from: (r) => str(r.id) },
  { key: 'customerId', label: 'Customer ID', from: (r) => str(r.customerId) },
  { key: 'title', label: 'Title', from: (r) => str(r.title) },
  { key: 'status', label: 'Status', from: (r) => str(r.status) },
  { key: 'technicianName', label: 'Technician', from: (r) => str(r.technicianName) },
  { key: 'scheduledFor', label: 'Scheduled for', from: (r) => iso(r.scheduledFor) },
  { key: 'completedAt', label: 'Completed at', from: (r) => iso(r.completedAt) },
  { key: 'workSummary', label: 'Work summary', from: (r) => str(r.workSummary) },
  { key: 'notes', label: 'Notes', from: (r) => str(r.notes) },
  { key: 'createdAt', label: 'Created at', from: (r) => iso(r.createdAt) },
  { key: 'updatedAt', label: 'Updated at', from: (r) => iso(r.updatedAt) },
]

const INVOICE_COLUMNS: Column[] = [
  { key: 'id', label: 'ID', from: (r) => str(r.id) },
  { key: 'invoiceNumber', label: 'Invoice number', from: (r) => str(r.invoiceNumber) },
  { key: 'customerId', label: 'Customer ID', from: (r) => str(r.customerId) },
  { key: 'jobId', label: 'Job ID', from: (r) => str(r.jobId) },
  { key: 'status', label: 'Status', from: (r) => str(r.status) },
  { key: 'subtotalCents', label: 'Subtotal (cents)', from: (r) => (typeof r.subtotalCents === 'number' ? r.subtotalCents : null) },
  { key: 'taxCents', label: 'Tax (cents)', from: (r) => (typeof r.taxCents === 'number' ? r.taxCents : null) },
  { key: 'totalCents', label: 'Total (cents)', from: (r) => (typeof r.totalCents === 'number' ? r.totalCents : null) },
  { key: 'outstandingCents', label: 'Outstanding (cents)', from: (r) => (typeof r.outstandingCents === 'number' ? r.outstandingCents : null) },
  { key: 'dueDate', label: 'Due date', from: (r) => iso(r.dueDate) },
  { key: 'sentAt', label: 'Sent at', from: (r) => iso(r.sentAt) },
  { key: 'paidAt', label: 'Paid at', from: (r) => iso(r.paidAt) },
  { key: 'createdAt', label: 'Created at', from: (r) => iso(r.createdAt) },
]

const PAYMENT_COLUMNS: Column[] = [
  { key: 'id', label: 'ID', from: (r) => str(r.id) },
  { key: 'invoiceId', label: 'Invoice ID', from: (r) => str(r.invoiceId) },
  { key: 'stripePaymentIntent', label: 'Stripe payment intent', from: (r) => str(r.stripePaymentIntent) },
  { key: 'amountCents', label: 'Amount (cents)', from: (r) => (typeof r.amountCents === 'number' ? r.amountCents : null) },
  { key: 'currency', label: 'Currency', from: (r) => str(r.currency) },
  { key: 'status', label: 'Status', from: (r) => str(r.status) },
  { key: 'paidAt', label: 'Paid at', from: (r) => iso(r.paidAt) },
  { key: 'createdAt', label: 'Created at', from: (r) => iso(r.createdAt) },
]

export const EXPORT_ENTITIES: Record<ExportEntity, EntitySpec> = {
  customers: {
    key: 'customers',
    label: 'Customers',
    description: 'Contact details and addresses. Soft-deleted customers are excluded.',
    columns: CUSTOMER_COLUMNS,
  },
  jobs: {
    key: 'jobs',
    label: 'Jobs',
    description: 'Job status, scheduling, and work summaries.',
    columns: JOB_COLUMNS,
  },
  invoices: {
    key: 'invoices',
    label: 'Invoices',
    description: 'Invoice totals in cents (source of truth). Line items are not nested.',
    columns: INVOICE_COLUMNS,
  },
  payments: {
    key: 'payments',
    label: 'Payments',
    description: 'Payment records. Status reflects webhook-confirmed truth.',
    columns: PAYMENT_COLUMNS,
  },
}

export const EXPORT_ENTITY_LIST: EntitySpec[] = [
  EXPORT_ENTITIES.customers,
  EXPORT_ENTITIES.jobs,
  EXPORT_ENTITIES.invoices,
  EXPORT_ENTITIES.payments,
]

/** Project a single raw row into the export column shape. */
export function projectRow(row: Row, columns: Column[]): Record<string, Cell> {
  const out: Record<string, Cell> = {}
  for (const c of columns) out[c.key] = c.from(row)
  return out
}

/**
 * Serialize rows to RFC-4180 CSV. Column order follows `columns`; values are
 * automatically quoted/escaped by papaparse. Null cells become empty strings.
 */
export function rowsToCsv(rows: Row[], columns: Column[]): string {
  const data = rows.map((r) => projectRow(r, columns))
  return Papa.unparse(data, {
    columns: columns.map((c) => c.key),
    newline: '\n',
  })
}

/** Serialize rows to pretty-printed JSON in the export column shape. */
export function rowsToJson(rows: Row[], columns: Column[]): string {
  const data = rows.map((r) => projectRow(r, columns))
  return JSON.stringify(data, null, 2)
}

/** Build a deterministic download filename for an export. */
export function exportFilename(entity: ExportEntity, format: ExportFormat): string {
  const date = new Date().toISOString().slice(0, 10)
  return `${entity}-${date}.${format}`
}
