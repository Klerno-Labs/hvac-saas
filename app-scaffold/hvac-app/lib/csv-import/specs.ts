import { z } from 'zod'
import {
  createCustomerSchema,
} from '@/lib/validations/customer'
import {
  createInventoryItemSchema,
} from '@/lib/validations/inventory'
import { EQUIPMENT_TYPES, type EquipmentType } from '@/lib/validations/equipment'

/**
 * Supported bulk-import entities. "pricebook" maps onto the existing
 * InventoryItem model (sku / sellPriceCents / unitCostCents / category) — there
 * is no dedicated PriceBook model in the schema, so we reuse InventoryItem and
 * avoid a migration. See docs/known-issues.md.
 */
export type ImportEntityType = 'customers' | 'equipment' | 'pricebook'

export type FieldType =
  | 'string'
  | 'text'
  | 'email'
  | 'integer'
  | 'decimal'
  | 'cents'
  | 'boolean'
  | 'enum'
  | 'date'

export type EntityField = {
  /** Target key on the entity's create input. */
  key: string
  label: string
  required: boolean
  type: FieldType
  /** Lowercase header aliases used for auto-mapping. */
  aliases: string[]
  /** For enum fields: canonical values. */
  enumValues?: readonly string[]
  /** For enum fields: alias -> canonical value (case-insensitive). */
  enumAliases?: Record<string, string>
  help?: string
}

/**
 * A column mapping is a partial record from entity field key -> source header.
 * Fields without a mapping (or mapped to '') are ignored.
 */
export type Mapping = Record<string, string>

export type EntitySpec = {
  key: ImportEntityType
  label: string
  singularLabel: string
  /** Field whose value (when present) identifies a duplicate within the org. */
  dedupeKey: string | null
  fields: EntityField[]
  /** Build the Zod-validated create payload from coerced field values. */
  schema: z.ZodType<Record<string, unknown>>
}

const trim = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

const CUSTOMER_FIELDS: EntityField[] = [
  { key: 'firstName', label: 'First name', required: true, type: 'string', aliases: ['first name', 'first', 'fname', 'given name', 'contact first name'] },
  { key: 'lastName', label: 'Last name', required: false, type: 'string', aliases: ['last name', 'last', 'lname', 'surname', 'contact last name'] },
  { key: 'companyName', label: 'Company', required: false, type: 'string', aliases: ['company', 'company name', 'business name', 'account name'] },
  { key: 'email', label: 'Email', required: false, type: 'email', aliases: ['email', 'email address', 'e-mail', 'email address 1', 'primary email'] },
  { key: 'phone', label: 'Phone', required: true, type: 'string', aliases: ['phone', 'phone number', 'mobile', 'cell', 'cell phone', 'primary phone', 'phone 1', 'work phone', 'contact phone'] },
  { key: 'addressLine1', label: 'Address line 1', required: false, type: 'string', aliases: ['address', 'address line 1', 'street', 'street address', 'address1', 'billing address'] },
  { key: 'addressLine2', label: 'Address line 2', required: false, type: 'string', aliases: ['address line 2', 'address2', 'unit', 'apt', 'suite'] },
  { key: 'city', label: 'City', required: false, type: 'string', aliases: ['city', 'town'] },
  { key: 'state', label: 'State', required: false, type: 'string', aliases: ['state', 'province', 'region', 'st'] },
  { key: 'postalCode', label: 'Postal code', required: false, type: 'string', aliases: ['postal code', 'zip', 'zip code', 'postcode', 'postal'] },
  { key: 'notes', label: 'Notes', required: false, type: 'text', aliases: ['notes', 'note', 'comments', 'comment', 'description'] },
]

const INVENTORY_FIELDS: EntityField[] = [
  { key: 'name', label: 'Name', required: true, type: 'string', aliases: ['name', 'item', 'item name', 'description', 'product', 'service', 'service name', 'part name'] },
  { key: 'sku', label: 'SKU', required: false, type: 'string', aliases: ['sku', 'sku/part number', 'part number', 'part #', 'item number', 'item code', 'code', 'product code'] },
  { key: 'description', label: 'Description', required: false, type: 'text', aliases: ['description', 'desc', 'long description', 'details'] },
  { key: 'unitCostCents', label: 'Unit cost (dollars)', required: false, type: 'cents', aliases: ['unit cost', 'cost', 'cost each', 'wholesale price', 'cost price', 'average cost'] },
  { key: 'sellPriceCents', label: 'Sell price (dollars)', required: false, type: 'cents', aliases: ['sell price', 'price', 'sale price', 'retail price', 'list price', 'unit price', 'billing rate', 'rate'] },
  { key: 'quantityOnHand', label: 'Quantity on hand', required: false, type: 'integer', aliases: ['quantity on hand', 'quantity', 'qty', 'on hand', 'stock', 'inventory qty'] },
  { key: 'reorderPoint', label: 'Reorder point', required: false, type: 'integer', aliases: ['reorder point', 'reorder', 'min stock', 'minimum', 'par level'] },
  { key: 'category', label: 'Category', required: false, type: 'string', aliases: ['category', 'type', 'department', 'class', 'product category'] },
]

/** Equipment-type aliases commonly found in competitor exports. */
const EQUIPMENT_ENUM_ALIASES: Record<string, EquipmentType> = {
  ac: 'ac_condenser',
  'a/c': 'ac_condenser',
  air: 'ac_condenser',
  condenser: 'ac_condenser',
  'ac condenser': 'ac_condenser',
  'central ac': 'ac_condenser',
  furnace: 'furnace',
  'heat pump': 'heat_pump',
  heatpump: 'heat_pump',
  'mini split': 'mini_split',
  minisplit: 'mini_split',
  'mini-split': 'mini_split',
  ductless: 'mini_split',
  boiler: 'boiler',
  'water heater': 'water_heater',
  waterheater: 'water_heater',
  'hot water heater': 'water_heater',
  thermostat: 'thermostat',
  'air handler': 'air_handler',
  airhandler: 'air_handler',
  ductwork: 'ductwork',
  ducts: 'ductwork',
}

const EQUIPMENT_FIELDS: EntityField[] = [
  /**
   * Equipment has a required FK to Customer. We resolve the customer at import
   * time by matching an existing customer in the org on email (preferred) or
   * phone. The matched customerId is injected before insert. If no match the
   * row fails with an actionable error.
   */
  { key: 'customerEmail', label: 'Customer email (match)', required: false, type: 'email', aliases: ['customer email', 'email', 'customer email address', 'owner email', 'contact email'], help: 'Used to match an existing customer in your org.' },
  { key: 'customerPhone', label: 'Customer phone (match)', required: false, type: 'string', aliases: ['customer phone', 'phone', 'customer phone number', 'owner phone', 'contact phone'], help: 'Fallback match if no email match.' },
  { key: 'type', label: 'Equipment type', required: true, type: 'enum', enumValues: EQUIPMENT_TYPES, enumAliases: EQUIPMENT_ENUM_ALIASES, aliases: ['type', 'equipment type', 'equipment', 'system type', 'unit type', 'category'] },
  { key: 'make', label: 'Make / brand', required: false, type: 'string', aliases: ['make', 'brand', 'manufacturer', 'mfg'] },
  { key: 'model', label: 'Model', required: false, type: 'string', aliases: ['model', 'model number', 'model no', 'model #'] },
  { key: 'serial', label: 'Serial number', required: false, type: 'string', aliases: ['serial', 'serial number', 'serial no', 'serial #', 's/n'] },
  { key: 'installDate', label: 'Install date', required: false, type: 'date', aliases: ['install date', 'installation date', 'installed', 'installed date', 'install'] },
  { key: 'tonnage', label: 'Tonnage', required: false, type: 'decimal', aliases: ['tonnage', 'tons', 'ton'] },
  { key: 'seer', label: 'SEER', required: false, type: 'decimal', aliases: ['seer', 'seer rating', 'seer2'] },
  { key: 'btu', label: 'BTU', required: false, type: 'integer', aliases: ['btu', 'btus', 'btuh', 'input btu', 'output btu'] },
  { key: 'locationOnProperty', label: 'Location', required: false, type: 'string', aliases: ['location', 'location on property', 'placement', 'where installed'] },
  { key: 'notes', label: 'Notes', required: false, type: 'text', aliases: ['notes', 'note', 'comments', 'description'] },
]

/**
 * Zod schema for the import-shaped equipment payload (before customerId is
 * injected). The shared createEquipmentSchema requires customerId + uses an
 * enum for type; for import we validate the same fields the user can supply.
 */
const equipmentImportSchema = z.object({
  customerEmail: z.string().email().optional().or(z.literal('')),
  customerPhone: z.string().max(30).optional().or(z.literal('')),
  type: z.enum(EQUIPMENT_TYPES as unknown as [EquipmentType, ...EquipmentType[]]),
  make: z.string().max(100).optional().or(z.literal('')),
  model: z.string().max(100).optional().or(z.literal('')),
  serial: z.string().max(100).optional().or(z.literal('')),
  installDate: z.string().max(20).optional().or(z.literal('')),
  tonnage: z.number().optional(),
  seer: z.number().optional(),
  btu: z.number().int().optional(),
  locationOnProperty: z.string().max(200).optional().or(z.literal('')),
  notes: z.string().max(2000).optional().or(z.literal('')),
})

export const ENTITY_SPECS: Record<ImportEntityType, EntitySpec> = {
  customers: {
    key: 'customers',
    label: 'Customers',
    singularLabel: 'customer',
    dedupeKey: 'email',
    fields: CUSTOMER_FIELDS,
    schema: createCustomerSchema as unknown as z.ZodType<Record<string, unknown>>,
  },
  pricebook: {
    key: 'pricebook',
    label: 'Price book items',
    singularLabel: 'price book item',
    dedupeKey: 'sku',
    fields: INVENTORY_FIELDS,
    schema: createInventoryItemSchema as unknown as z.ZodType<Record<string, unknown>>,
  },
  equipment: {
    key: 'equipment',
    label: 'Equipment',
    singularLabel: 'equipment record',
    dedupeKey: 'serial',
    fields: EQUIPMENT_FIELDS,
    schema: equipmentImportSchema as unknown as z.ZodType<Record<string, unknown>>,
  },
}

export function getEntitySpec(key: ImportEntityType): EntitySpec {
  return ENTITY_SPECS[key]
}

export { trim }
