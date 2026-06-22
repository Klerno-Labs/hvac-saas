import { z } from 'zod'

export const INVOICE_STATUSES = ['draft', 'sent', 'paid', 'void', 'overdue'] as const
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number]

/**
 * Tax rate in basis points (1 bps = 0.01%). null means "inherit the org
 * default rate". A concrete value overrides the org default for this line.
 */
const taxRateBpsSchema = z.number().int().min(0).max(100_000).nullable().optional()

const invoiceLineItemSchema = z.object({
  name: z.string().min(1, 'Line item name is required').max(200),
  description: z.string().max(500).optional().or(z.literal('')),
  quantity: z.number().int().min(1, 'Quantity must be at least 1'),
  unitPriceCents: z.number().int().min(0, 'Price must be non-negative'),
  taxable: z.boolean().default(true),
  taxRateBps: taxRateBpsSchema,
})

export const createInvoiceSchema = z.object({
  jobId: z.string().min(1, 'Job is required'),
  descriptionOfWork: z.string().min(1, 'Description of work is required').max(5000),
  notes: z.string().max(2000).optional().or(z.literal('')),
  dueDate: z.string().optional().or(z.literal('')),
  lineItems: z.array(invoiceLineItemSchema).min(1, 'At least one line item is required'),
})

export const updateInvoiceSchema = z.object({
  descriptionOfWork: z.string().min(1, 'Description of work is required').max(5000),
  notes: z.string().max(2000).optional().or(z.literal('')),
  dueDate: z.string().optional().or(z.literal('')),
  lineItems: z.array(invoiceLineItemSchema).min(1, 'At least one line item is required'),
})

export const updateInvoiceStatusSchema = z.object({
  status: z.enum(INVOICE_STATUSES, { errorMap: () => ({ message: 'Invalid invoice status' }) }),
})

export type InvoiceLineItemInput = z.infer<typeof invoiceLineItemSchema>
export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>
