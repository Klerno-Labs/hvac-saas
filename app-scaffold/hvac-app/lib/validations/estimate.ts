import { z } from 'zod'
import { documentLineItemSchema, documentCentsSchema, validateDocumentTotals } from './document'

export const ESTIMATE_STATUSES = ['draft', 'sent', 'accepted', 'declined'] as const
export type EstimateStatus = (typeof ESTIMATE_STATUSES)[number]

const lineItemSchema = documentLineItemSchema

export const createEstimateSchema = z.object({
  jobId: z.string().min(1, 'Job is required'),
  scopeOfWork: z.string().trim().min(1, 'Scope of work is required').max(5000),
  terms: z.string().max(2000).optional().or(z.literal('')),
  notes: z.string().max(2000).optional().or(z.literal('')),
  taxCents: documentCentsSchema.default(0),
  lineItems: z.array(lineItemSchema).min(1, 'At least one line item is required').max(100, 'Use at most 100 line items'),
}).superRefine(validateDocumentTotals)

export const updateEstimateSchema = z.object({
  scopeOfWork: z.string().trim().min(1, 'Scope of work is required').max(5000),
  terms: z.string().max(2000).optional().or(z.literal('')),
  notes: z.string().max(2000).optional().or(z.literal('')),
  taxCents: documentCentsSchema.default(0),
  lineItems: z.array(lineItemSchema).min(1, 'At least one line item is required').max(100, 'Use at most 100 line items'),
}).superRefine(validateDocumentTotals)

export const updateEstimateStatusSchema = z.object({
  status: z.enum(ESTIMATE_STATUSES, { errorMap: () => ({ message: 'Invalid estimate status' }) }),
})

export type LineItemInput = z.infer<typeof lineItemSchema>
export type CreateEstimateInput = z.infer<typeof createEstimateSchema>
