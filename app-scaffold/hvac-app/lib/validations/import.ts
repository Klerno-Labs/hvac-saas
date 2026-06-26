import { z } from 'zod'
import { EQUIPMENT_TYPES, type EquipmentType } from '@/lib/validations/equipment'

/** Parse a human-readable dollar string to integer cents. Empty string → 0. */
export function dollarsToCents(v: string): number {
  if (v === '' || v == null) return 0
  const n = Number(v.replace(/[$,]/g, ''))
  if (!Number.isFinite(n)) throw new Error(`"${v}" is not a valid dollar amount`)
  return Math.round(n * 100)
}

const dollarPreprocess = (v: unknown) =>
  typeof v === 'string' ? dollarsToCents(v) : typeof v === 'number' ? v : 0

const intPreprocess = (v: unknown) =>
  v === '' || v === undefined || v === null ? 0 : Math.trunc(Number(v))

const optionalNumPreprocess = (v: unknown) =>
  v === '' || v === undefined || v === null ? undefined : Number(v)

/** Like createCustomerSchema but phone is OPTIONAL — competitor exports often omit it. */
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

export type CustomerImportInput = z.infer<typeof customerImportSchema>

/**
 * Equipment import shape: no customerId — instead customerEmail/customerPhone are used
 * as lookup keys by the import layer. Numeric fields use preprocess to accept CSV strings.
 */
export const equipmentImportSchema = z.object({
  customerEmail: z.string().email().optional().or(z.literal('')),
  customerPhone: z.string().max(30).optional().or(z.literal('')),
  type: z.enum(EQUIPMENT_TYPES as unknown as [EquipmentType, ...EquipmentType[]]),
  make: z.string().max(100).optional().or(z.literal('')),
  model: z.string().max(100).optional().or(z.literal('')),
  serial: z.string().max(100).optional().or(z.literal('')),
  installDate: z.string().max(20).optional().or(z.literal('')),
  tonnage: z.preprocess(optionalNumPreprocess, z.number().optional()),
  seer: z.preprocess(optionalNumPreprocess, z.number().optional()),
  btu: z.preprocess(optionalNumPreprocess, z.number().int().optional()),
  partsWarrantyMonths: z.preprocess(optionalNumPreprocess, z.number().int().optional()),
  laborWarrantyMonths: z.preprocess(optionalNumPreprocess, z.number().int().optional()),
  locationOnProperty: z.string().max(200).optional().or(z.literal('')),
  notes: z.string().max(2000).optional().or(z.literal('')),
})

export type EquipmentImportInput = z.infer<typeof equipmentImportSchema>

/**
 * Pricebook import shape: mirrors createInventoryItemSchema but accepts human dollar
 * strings (e.g. "$1,234.56") for unitCostCents and sellPriceCents via dollarsToCents.
 */
export const pricebookImportSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  sku: z.string().max(100).optional().or(z.literal('')),
  description: z.string().max(2000).optional().or(z.literal('')),
  unitCostCents: z.preprocess(dollarPreprocess, z.number().int().min(0)),
  sellPriceCents: z.preprocess(dollarPreprocess, z.number().int().min(0)),
  quantityOnHand: z.preprocess(intPreprocess, z.number().int().min(0)),
  reorderPoint: z.preprocess(intPreprocess, z.number().int().min(0)),
  category: z.string().max(100).optional().or(z.literal('')),
})

export type PricebookImportInput = z.infer<typeof pricebookImportSchema>
