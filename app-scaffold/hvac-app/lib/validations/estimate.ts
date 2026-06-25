import { z } from 'zod'

export const ESTIMATE_STATUSES = ['draft', 'sent', 'accepted', 'declined'] as const
export type EstimateStatus = (typeof ESTIMATE_STATUSES)[number]

const lineItemSchema = z.object({
  name: z.string().min(1, 'Line item name is required').max(200),
  description: z.string().max(500).optional().or(z.literal('')),
  quantity: z.number().int().min(1, 'Quantity must be at least 1'),
  unitPriceCents: z.number().int().min(0, 'Price must be non-negative'),
  taxable: z.boolean().default(true),
  taxRateBps: z.number().int().min(0).default(0),
})

export const createEstimateSchema = z.object({
  jobId: z.string().min(1, 'Job is required'),
  scopeOfWork: z.string().min(1, 'Scope of work is required').max(5000),
  terms: z.string().max(2000).optional().or(z.literal('')),
  notes: z.string().max(2000).optional().or(z.literal('')),
  lineItems: z.array(lineItemSchema).min(1, 'At least one line item is required'),
})

export const updateEstimateSchema = z.object({
  scopeOfWork: z.string().min(1, 'Scope of work is required').max(5000),
  terms: z.string().max(2000).optional().or(z.literal('')),
  notes: z.string().max(2000).optional().or(z.literal('')),
  lineItems: z.array(lineItemSchema).min(1, 'At least one line item is required'),
})

export const updateEstimateStatusSchema = z.object({
  status: z.enum(ESTIMATE_STATUSES, { errorMap: () => ({ message: 'Invalid estimate status' }) }),
})

export type LineItemInput = z.infer<typeof lineItemSchema>
export type CreateEstimateInput = z.infer<typeof createEstimateSchema>
