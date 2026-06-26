export type EntityKind = 'customers' | 'equipment' | 'pricebook'

export type FieldDef = {
  key: string
  label: string
  required: boolean
  /** Accepted header aliases — compared after lowercasing and normalizing separators. */
  aliases: string[]
}

const CUSTOMER_FIELDS: FieldDef[] = [
  { key: 'firstName', label: 'First name', required: true, aliases: ['first name', 'firstname', 'first', 'fname', 'given name', 'contact first name'] },
  { key: 'lastName', label: 'Last name', required: false, aliases: ['last name', 'lastname', 'last', 'lname', 'surname', 'contact last name'] },
  { key: 'companyName', label: 'Company', required: false, aliases: ['company', 'company name', 'business name', 'account name'] },
  { key: 'email', label: 'Email', required: false, aliases: ['email', 'email address', 'e-mail', 'email address 1', 'primary email'] },
  { key: 'phone', label: 'Phone', required: false, aliases: ['phone', 'phone number', 'mobile', 'cell', 'cell phone', 'primary phone', 'work phone'] },
  { key: 'addressLine1', label: 'Address line 1', required: false, aliases: ['address', 'address line 1', 'street', 'street address', 'address1'] },
  { key: 'addressLine2', label: 'Address line 2', required: false, aliases: ['address line 2', 'address2', 'unit', 'apt', 'suite'] },
  { key: 'city', label: 'City', required: false, aliases: ['city', 'town'] },
  { key: 'state', label: 'State', required: false, aliases: ['state', 'province', 'region'] },
  { key: 'postalCode', label: 'Postal code', required: false, aliases: ['postal code', 'zip', 'zip code', 'postcode', 'postal'] },
  { key: 'notes', label: 'Notes', required: false, aliases: ['notes', 'note', 'comments', 'comment'] },
]

const EQUIPMENT_FIELDS: FieldDef[] = [
  { key: 'customerEmail', label: 'Customer email (match)', required: false, aliases: ['customer email', 'email', 'customer email address', 'owner email', 'contact email'] },
  { key: 'customerPhone', label: 'Customer phone (match)', required: false, aliases: ['customer phone', 'phone', 'customer phone number', 'owner phone'] },
  { key: 'type', label: 'Equipment type', required: true, aliases: ['type', 'equipment type', 'equipment', 'system type', 'unit type', 'category'] },
  { key: 'make', label: 'Make / brand', required: false, aliases: ['make', 'brand', 'manufacturer', 'mfg'] },
  { key: 'model', label: 'Model', required: false, aliases: ['model', 'model number', 'model no', 'model #'] },
  { key: 'serial', label: 'Serial number', required: false, aliases: ['serial', 'serial number', 'serial no', 'serial #', 's/n'] },
  { key: 'installDate', label: 'Install date', required: false, aliases: ['install date', 'installation date', 'installed', 'installed date'] },
  { key: 'tonnage', label: 'Tonnage', required: false, aliases: ['tonnage', 'tons', 'ton'] },
  { key: 'seer', label: 'SEER', required: false, aliases: ['seer', 'seer rating', 'seer2'] },
  { key: 'btu', label: 'BTU', required: false, aliases: ['btu', 'btus', 'btuh', 'input btu', 'output btu'] },
  { key: 'locationOnProperty', label: 'Location', required: false, aliases: ['location', 'location on property', 'placement'] },
  { key: 'notes', label: 'Notes', required: false, aliases: ['notes', 'note', 'comments', 'description'] },
]

const PRICEBOOK_FIELDS: FieldDef[] = [
  { key: 'name', label: 'Name', required: true, aliases: ['name', 'item', 'item name', 'product', 'service', 'service name', 'part name'] },
  { key: 'sku', label: 'SKU', required: false, aliases: ['sku', 'part number', 'part #', 'item number', 'item code', 'product code'] },
  { key: 'description', label: 'Description', required: false, aliases: ['description', 'desc', 'long description', 'details'] },
  { key: 'unitCostCents', label: 'Unit cost', required: false, aliases: ['unit cost', 'cost', 'cost each', 'wholesale price', 'cost price'] },
  { key: 'sellPriceCents', label: 'Sell price', required: false, aliases: ['sell price', 'price', 'sale price', 'retail price', 'list price', 'unit price', 'rate'] },
  { key: 'quantityOnHand', label: 'Quantity on hand', required: false, aliases: ['quantity on hand', 'quantity', 'qty', 'on hand', 'stock'] },
  { key: 'reorderPoint', label: 'Reorder point', required: false, aliases: ['reorder point', 'reorder', 'min stock', 'minimum', 'par level'] },
  { key: 'category', label: 'Category', required: false, aliases: ['category', 'type', 'department', 'class', 'product category'] },
]

export const FIELD_DEFS: Record<EntityKind, FieldDef[]> = {
  customers: CUSTOMER_FIELDS,
  equipment: EQUIPMENT_FIELDS,
  pricebook: PRICEBOOK_FIELDS,
}

// RFC-4180 compliant: handles quoted fields, embedded commas, embedded newlines,
// and escaped double-quotes ("").
function parseRfc4180(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let i = 0

  const flushField = () => { row.push(field); field = '' }
  const flushRow = () => {
    flushField()
    if (row.some((c) => c.trim() !== '')) rows.push(row)
    row = []
  }

  while (i < text.length) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 2
        } else {
          inQuotes = false
          i++
        }
      } else {
        field += ch
        i++
      }
    } else {
      if (ch === '"') {
        inQuotes = true
        i++
      } else if (ch === ',') {
        flushField()
        i++
      } else if (ch === '\r') {
        flushRow()
        if (text[i + 1] === '\n') i++
        i++
      } else if (ch === '\n') {
        flushRow()
        i++
      } else {
        field += ch
        i++
      }
    }
  }
  flushRow()
  return rows
}

export function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const grid = parseRfc4180(text.trim())
  if (grid.length === 0) return { headers: [], rows: [] }

  const headers = grid[0].map((h) => h.trim())
  const width = headers.length

  const rows = grid.slice(1).map((row) => {
    const obj: Record<string, string> = {}
    for (let j = 0; j < width; j++) {
      obj[headers[j]] = (row[j] ?? '').trim()
    }
    return obj
  })

  return { headers, rows }
}

const normalizeForMatch = (s: string): string =>
  s.toLowerCase().replace(/[_\-.]+/g, ' ').replace(/\s+/g, ' ').trim()

/**
 * Auto-map incoming CSV headers to entity field keys by alias.
 * Each source header is bound to at most one field (first match by field order).
 * Returns null for fields with no matching header.
 */
export function suggestMapping(headers: string[], kind: EntityKind): Record<string, string | null> {
  const fields = FIELD_DEFS[kind]
  const normalizedHeaders = headers.map(normalizeForMatch)
  const used = new Set<number>()
  const result: Record<string, string | null> = {}

  for (const field of fields) {
    const normalizedAliases = field.aliases.map(normalizeForMatch)
    const normalizedKey = normalizeForMatch(field.key)
    let matched: string | null = null

    for (let i = 0; i < headers.length; i++) {
      if (used.has(i)) continue
      const nh = normalizedHeaders[i]
      if (normalizedAliases.includes(nh) || nh === normalizedKey) {
        matched = headers[i]
        used.add(i)
        break
      }
    }
    result[field.key] = matched
  }

  return result
}
