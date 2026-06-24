import type { EntitySpec, Mapping } from './specs'

const normalizeHeader = (h: string): string =>
  h.toLowerCase().replace(/[_\-.]+/g, ' ').replace(/\s+/g, ' ').trim()

/**
 * Produce a suggested column mapping (entityFieldKey -> sourceHeader).
 *
 * Strategy: for each field, prefer an exact alias match; fall back to a header
 * that contains the field's key or any alias. Each source header is only bound
 * to one field (first-wins by field order), so two fields never claim the same
 * column.
 */
export function suggestMapping(headers: string[], spec: EntitySpec): Mapping {
  const normalized = headers.map(normalizeHeader)
  const mapping: Mapping = {}
  const usedHeaders = new Set<number>()

  for (const field of spec.fields) {
    // 1. Exact alias match.
    for (let i = 0; i < headers.length; i++) {
      if (usedHeaders.has(i)) continue
      const nh = normalized[i]
      if (!nh) continue
      if (field.aliases.includes(nh) || nh === normalizeHeader(field.key)) {
        mapping[field.key] = headers[i]
        usedHeaders.add(i)
        break
      }
    }
    if (mapping[field.key]) continue

    // 2. Substring match against any alias / key.
    for (let i = 0; i < headers.length; i++) {
      if (usedHeaders.has(i)) continue
      const nh = normalized[i]
      if (!nh) continue
      const candidates = [...field.aliases, normalizeHeader(field.key)]
      if (candidates.some((c) => c && (nh === c || nh.includes(c) || c.includes(nh)))) {
        mapping[field.key] = headers[i]
        usedHeaders.add(i)
        break
      }
    }
  }

  return mapping
}

/**
 * Apply a mapping to parsed rows, producing one object per row keyed by entity
 * field key. Unmapped fields are omitted (not ''). Cells are trimmed.
 */
export function applyMapping(
  rows: string[][],
  headers: string[],
  mapping: Mapping,
  spec: EntitySpec,
): Record<string, string>[] {
  const headerIndex = new Map<string, number>()
  headers.forEach((h, i) => headerIndex.set(h, i))

  const fieldToIndex: { field: string; index: number }[] = []
  for (const field of spec.fields) {
    const source = mapping[field.key]
    if (!source) continue
    const idx = headerIndex.get(source)
    if (idx === undefined) continue
    fieldToIndex.push({ field: field.key, index: idx })
  }

  return rows.map((row) => {
    const obj: Record<string, string> = {}
    for (const { field, index } of fieldToIndex) {
      const val = row[index]
      obj[field] = typeof val === 'string' ? val.trim() : ''
    }
    return obj
  })
}
