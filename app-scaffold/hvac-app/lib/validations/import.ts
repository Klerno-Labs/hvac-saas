import { z } from 'zod'
import { EQUIPMENT_TYPES } from '@/lib/validations/equipment'

/**
 * Parse a human-formatted dollar string to integer cents.
 * Strips $, commas, and whitespace. Returns 0 for empty input.
 * Examples: '$1,234.56' → 123456, '9.99' → 999, '' → 0
 */
export function dollarsToCents(v: string): number {
  if (v === '') return 0
  const n = Number(v.replace(/[$,\s]/g, ''))
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 100)
}

const centsPreprocess = (v: unknown): unknown => {
  if (v === undefined || v === null || v === '') return undefined
  if (typeof v === 'number') return v
  return dollarsToCents(String(v))
}

const numericPreprocess = (v: unknown): unknown => {
  if (v === undefined || v === null || v === '') return undefined
  if (typeof v === 'number') return v
  const n = Number(String(v).replace(/[$,]/g, ''))
  return Number.isFinite(n) ? n : undefined
}

// ---------------------------------------------------------------------------
// Customer import schema
// Phone is OPTIONAL — competitor exports frequently omit it.
// ---------------------------------------------------------------------------

export const customerImportSchema = z.object({
  firstName: z.string().min(1, 'First name is required').max(100),
  lastName: z.string().max(100).optional().or(z.literal('')),
  companyName: z.string().max(200).optional().or(z.literal('')),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  phone: z.string().max(30).optional().or(z.literal('')),
  addressLine1: z.string().max(200).optional().or(z.literal('')),
  addressLine2: z.string().max(200).optional().or(z.literal('')),
  city: z.string().max(100).optional().or(z.literal('')),
  state: z.string().max(50).optional().or(z.literal('')),
  postalCode: z.string().max(20).optional().or(z.literal('')),
  notes: z.string().max(2000).optional().or(z.literal('')),
})

export type CustomerImport = z.infer<typeof customerImportSchema>

// ---------------------------------------------------------------------------
// Equipment import schema
// No customerId — caller resolves via customerEmail at import time.
// ---------------------------------------------------------------------------

export const equipmentImportSchema = z.object({
  customerEmail: z.string().email().optional().or(z.literal('')),
  type: z.enum([...EQUIPMENT_TYPES] as [string, ...string[]]),
  make: z.string().max(100).optional().or(z.literal('')),
  model: z.string().max(100).optional().or(z.literal('')),
  serial: z.string().max(100).optional().or(z.literal('')),
  installDate: z.string().max(20).optional().or(z.literal('')),
  tonnage: z.preprocess(numericPreprocess, z.number().optional()),
  seer: z.preprocess(numericPreprocess, z.number().optional()),
  btu: z.preprocess(numericPreprocess, z.number().int().optional()),
  partsWarrantyMonths: z.preprocess(numericPreprocess, z.number().int().optional()),
  laborWarrantyMonths: z.preprocess(numericPreprocess, z.number().int().optional()),
  locationOnProperty: z.string().max(200).optional().or(z.literal('')),
  notes: z.string().max(2000).optional().or(z.literal('')),
})

export type EquipmentImport = z.infer<typeof equipmentImportSchema>

// ---------------------------------------------------------------------------
// Pricebook import schema (maps onto InventoryItem — no separate model)
// Accepts human dollar strings for unitCostCents / sellPriceCents.
// ---------------------------------------------------------------------------

export const pricebookImportSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  sku: z.string().max(100).optional().or(z.literal('')),
  description: z.string().max(2000).optional().or(z.literal('')),
  unitCostCents: z.preprocess(centsPreprocess, z.number().int().min(0).optional()),
  sellPriceCents: z.preprocess(centsPreprocess, z.number().int().min(0).optional()),
  category: z.string().max(100).optional().or(z.literal('')),
})

export type PricebookImport = z.infer<typeof pricebookImportSchema>
