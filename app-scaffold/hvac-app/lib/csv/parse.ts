// Hand-rolled RFC-4180-ish CSV parser — no external dependencies.

export type EntityKind = 'customers' | 'equipment' | 'pricebook'

export type FieldDef = {
  key: string
  label: string
  required: boolean
  /** Lowercase/trimmed accepted header aliases for auto-mapping. */
  aliases: string[]
}

/**
 * Parse CSV text into headers + per-row objects.
 * - First non-empty line is the header row.
 * - Each subsequent row is mapped header→cell; short rows default missing cells to ''.
 * - Handles quoted fields, embedded commas, embedded newlines, and "" escapes.
 */
export function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const grid = parseCells(text).filter((row) => row.some((c) => c.trim() !== ''))
  if (grid.length === 0) return { headers: [], rows: [] }

  const headers = grid[0].map((h) => h.trim())
  const width = headers.length

  const rows = grid.slice(1).map((row) => {
    const obj: Record<string, string> = {}
    for (let i = 0; i < width; i++) {
      obj[headers[i]] = i < row.length ? row[i] : ''
    }
    return obj
  })

  return { headers, rows }
}

/** Parse text into a 2-D array of raw string cells (RFC-4180 state machine). */
function parseCells(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let i = 0
  const n = text.length

  while (i < n) {
    const ch = text[i]

    if (ch === '"') {
      // Quoted field — consume until closing unescaped quote.
      i++
      while (i < n) {
        if (text[i] === '"') {
          if (i + 1 < n && text[i + 1] === '"') {
            // Escaped double-quote "" → single "
            cell += '"'
            i += 2
          } else {
            i++ // closing quote
            break
          }
        } else {
          cell += text[i++]
        }
      }
      // Skip any trailing junk between closing quote and next delimiter (lenient).
      while (i < n && text[i] !== ',' && text[i] !== '\r' && text[i] !== '\n') i++
    } else if (ch === ',') {
      row.push(cell)
      cell = ''
      i++
    } else if (ch === '\r') {
      row.push(cell)
      cell = ''
      rows.push(row)
      row = []
      i++
      if (i < n && text[i] === '\n') i++ // CRLF
    } else if (ch === '\n') {
      row.push(cell)
      cell = ''
      rows.push(row)
      row = []
      i++
    } else {
      cell += ch
      i++
    }
  }

  // Flush last row (handles files without a trailing newline).
  row.push(cell)
  if (row.length > 1 || row[0] !== '') {
    rows.push(row)
  }

  return rows
}

// ---------------------------------------------------------------------------
// Field definitions
// ---------------------------------------------------------------------------

const CUSTOMER_FIELDS: FieldDef[] = [
  { key: 'firstName', label: 'First name', required: true, aliases: ['first name', 'firstname', 'first', 'fname', 'given name', 'contact first name'] },
  { key: 'lastName', label: 'Last name', required: false, aliases: ['last name', 'lastname', 'last', 'lname', 'surname', 'contact last name'] },
  { key: 'companyName', label: 'Company', required: false, aliases: ['company', 'company name', 'business name', 'account name'] },
  { key: 'email', label: 'Email', required: false, aliases: ['email', 'e-mail', 'email address', 'primary email', 'email address 1'] },
  { key: 'phone', label: 'Phone', required: false, aliases: ['phone', 'phone number', 'mobile', 'cell', 'cell phone', 'primary phone', 'work phone', 'contact phone'] },
  { key: 'addressLine1', label: 'Address', required: false, aliases: ['address', 'address line 1', 'street', 'street address', 'address1', 'billing address'] },
  { key: 'addressLine2', label: 'Address 2', required: false, aliases: ['address line 2', 'address2', 'unit', 'apt', 'suite'] },
  { key: 'city', label: 'City', required: false, aliases: ['city', 'town'] },
  { key: 'state', label: 'State', required: false, aliases: ['state', 'province', 'region', 'st'] },
  { key: 'postalCode', label: 'Postal code', required: false, aliases: ['postal code', 'zip', 'zip code', 'postcode', 'postal'] },
  { key: 'notes', label: 'Notes', required: false, aliases: ['notes', 'note', 'comments', 'comment', 'description'] },
]

const EQUIPMENT_FIELDS: FieldDef[] = [
  { key: 'customerEmail', label: 'Customer email', required: false, aliases: ['customer email', 'email', 'customer email address', 'owner email', 'contact email'] },
  { key: 'type', label: 'Equipment type', required: true, aliases: ['type', 'equipment type', 'equipment', 'system type', 'unit type', 'category'] },
  { key: 'make', label: 'Make', required: false, aliases: ['make', 'brand', 'manufacturer', 'mfg'] },
  { key: 'model', label: 'Model', required: false, aliases: ['model', 'model number', 'model no', 'model #'] },
  { key: 'serial', label: 'Serial number', required: false, aliases: ['serial', 'serial number', 'serial no', 'serial #', 's/n'] },
  { key: 'installDate', label: 'Install date', required: false, aliases: ['install date', 'installation date', 'installed', 'installed date'] },
  { key: 'tonnage', label: 'Tonnage', required: false, aliases: ['tonnage', 'tons', 'ton'] },
  { key: 'seer', label: 'SEER', required: false, aliases: ['seer', 'seer rating', 'seer2'] },
  { key: 'btu', label: 'BTU', required: false, aliases: ['btu', 'btus', 'btuh', 'input btu', 'output btu'] },
  { key: 'partsWarrantyMonths', label: 'Parts warranty (months)', required: false, aliases: ['parts warranty months', 'parts warranty', 'warranty months', 'parts warranty (months)'] },
  { key: 'laborWarrantyMonths', label: 'Labor warranty (months)', required: false, aliases: ['labor warranty months', 'labor warranty', 'labor warranty (months)'] },
  { key: 'locationOnProperty', label: 'Location', required: false, aliases: ['location', 'location on property', 'placement', 'where installed'] },
  { key: 'notes', label: 'Notes', required: false, aliases: ['notes', 'note', 'comments', 'description'] },
]

const PRICEBOOK_FIELDS: FieldDef[] = [
  { key: 'name', label: 'Name', required: true, aliases: ['name', 'item', 'item name', 'product', 'service', 'service name', 'part name'] },
  { key: 'sku', label: 'SKU', required: false, aliases: ['sku', 'sku/part number', 'part number', 'part #', 'item number', 'item code', 'product code'] },
  { key: 'description', label: 'Description', required: false, aliases: ['description', 'desc', 'long description', 'details'] },
  { key: 'unitCostCents', label: 'Unit cost', required: false, aliases: ['unit cost', 'cost', 'cost each', 'wholesale price', 'cost price', 'average cost'] },
  { key: 'sellPriceCents', label: 'Sell price', required: false, aliases: ['sell price', 'price', 'sale price', 'retail price', 'list price', 'unit price', 'billing rate', 'rate'] },
  { key: 'category', label: 'Category', required: false, aliases: ['category', 'type', 'department', 'class', 'product category'] },
]

export const FIELD_DEFS: Record<EntityKind, FieldDef[]> = {
  customers: CUSTOMER_FIELDS,
  equipment: EQUIPMENT_FIELDS,
  pricebook: PRICEBOOK_FIELDS,
}

const normalizeHeader = (h: string): string =>
  h.toLowerCase().replace(/[_\-.]+/g, ' ').replace(/\s+/g, ' ').trim()

/**
 * Auto-map each target field to the best-matching incoming header by alias.
 * Each source header is bound to at most one field (first-wins by field order).
 * Returns null for fields with no match.
 */
export function suggestMapping(headers: string[], kind: EntityKind): Record<string, string | null> {
  const fields = FIELD_DEFS[kind]
  const normalized = headers.map(normalizeHeader)
  const mapping: Record<string, string | null> = {}
  const used = new Set<number>()

  for (const field of fields) {
    let matched = false

    // 1. Exact alias or key match.
    for (let i = 0; i < headers.length; i++) {
      if (used.has(i)) continue
      const nh = normalized[i]
      if (field.aliases.includes(nh) || nh === normalizeHeader(field.key)) {
        mapping[field.key] = headers[i]
        used.add(i)
        matched = true
        break
      }
    }
    if (matched) continue

    // 2. Substring match.
    for (let i = 0; i < headers.length; i++) {
      if (used.has(i)) continue
      const nh = normalized[i]
      const candidates = [...field.aliases, normalizeHeader(field.key)]
      if (candidates.some((c) => c && (nh.includes(c) || c.includes(nh)))) {
        mapping[field.key] = headers[i]
        used.add(i)
        matched = true
        break
      }
    }

    if (!matched) mapping[field.key] = null
  }

  return mapping
}
