import { MAX_DOCUMENT_CENTS } from './document'
import { z } from 'zod'

export const createInventoryItemSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  sku: z.string().max(100).optional().or(z.literal('')),
  description: z.string().max(2000).optional().or(z.literal('')),
  unitCostCents: z.coerce.number().int().max(MAX_DOCUMENT_CENTS).min(0, 'Unit cost must be 0 or more'),
  sellPriceCents: z.coerce.number().int().max(MAX_DOCUMENT_CENTS).min(0, 'Sell price must be 0 or more'),
  quantityOnHand: z.coerce.number().int().max(MAX_DOCUMENT_CENTS).min(0, 'Quantity must be 0 or more'),
  reorderPoint: z.coerce.number().int().max(MAX_DOCUMENT_CENTS).min(0, 'Reorder point must be 0 or more'),
  category: z.string().max(100).optional().or(z.literal('')),
})

export type CreateInventoryItemInput = z.infer<typeof createInventoryItemSchema>

export const updateInventoryItemSchema = createInventoryItemSchema

export type UpdateInventoryItemInput = z.infer<typeof updateInventoryItemSchema>

export const recordInventoryUsageSchema = z.object({
  inventoryItemId: z.string().min(1, 'Part is required'),
  quantity: z.coerce.number().int().max(MAX_DOCUMENT_CENTS).min(1, 'Quantity must be at least 1'),
  notes: z.string().max(500).optional().or(z.literal('')),
})

export type RecordInventoryUsageInput = z.infer<typeof recordInventoryUsageSchema>
