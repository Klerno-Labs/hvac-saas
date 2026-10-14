import { z } from 'zod'
import { documentLineItemSchema, documentCentsSchema, validateDocumentTotals, documentDateSchema } from './document'

export const INVOICE_STATUSES = ['draft', 'sent', 'paid', 'void', 'overdue'] as const
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number]

const invoiceLineItemSchema = documentLineItemSchema

export const createInvoiceSchema = z.object({
  jobId: z.string().min(1, 'Job is required'),
  descriptionOfWork: z.string().trim().min(1, 'Description of work is required').max(5000),
  notes: z.string().max(2000).optional().or(z.literal('')),
  taxCents: documentCentsSchema.default(0),
  dueDate: documentDateSchema,
  lineItems: z.array(invoiceLineItemSchema).min(1, 'At least one line item is required').max(100, 'Use at most 100 line items'),
}).superRefine(validateDocumentTotals)

export const updateInvoiceSchema = z.object({
  descriptionOfWork: z.string().trim().min(1, 'Description of work is required').max(5000),
  notes: z.string().max(2000).optional().or(z.literal('')),
  taxCents: documentCentsSchema.default(0),
  dueDate: documentDateSchema,
  lineItems: z.array(invoiceLineItemSchema).min(1, 'At least one line item is required').max(100, 'Use at most 100 line items'),
}).superRefine(validateDocumentTotals)

export const updateInvoiceStatusSchema = z.object({
  status: z.enum(INVOICE_STATUSES, { errorMap: () => ({ message: 'Invalid invoice status' }) }),
})

export type InvoiceLineItemInput = z.infer<typeof invoiceLineItemSchema>
export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>
