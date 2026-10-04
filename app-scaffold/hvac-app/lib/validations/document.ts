import { z } from 'zod'

// These amounts are persisted as PostgreSQL Int, so validate the entire
// calculation before attempting a write rather than just each input value.
export const MAX_DOCUMENT_CENTS = 2_147_483_647
export const documentCentsSchema = z.number().int().min(0, 'Amount must be non-negative').max(MAX_DOCUMENT_CENTS, 'Amount exceeds the supported limit')
export const documentLineItemSchema = z.object({
  name: z.string().trim().min(1, 'Line item name is required').max(200),
  description: z.string().max(500).optional().or(z.literal('')),
  quantity: z.number().int().min(1, 'Quantity must be at least 1').max(MAX_DOCUMENT_CENTS),
  unitPriceCents: documentCentsSchema,
})

export function validateDocumentTotals(
  document: { taxCents: number; lineItems: { quantity: number; unitPriceCents: number }[] },
  ctx: z.RefinementCtx,
) {
  let totalCents = document.taxCents
  document.lineItems.forEach((item, index) => {
    const amount = item.quantity * item.unitPriceCents
    if (!Number.isSafeInteger(amount) || amount > MAX_DOCUMENT_CENTS) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['lineItems', index, 'unitPriceCents'], message: 'This line item total exceeds the supported limit' })
    }
    totalCents += amount
  })
  if (!Number.isSafeInteger(totalCents) || totalCents > MAX_DOCUMENT_CENTS) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['lineItems'], message: 'The document total exceeds the supported limit' })
  }
}

export const documentDateSchema = z.string().refine(value => {
  if (value === '') return true
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}, 'Enter a valid date').optional()
