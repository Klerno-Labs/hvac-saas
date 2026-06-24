import type { EntitySpec, EntityField } from './specs'

export type RowError = { field?: string; message: string }

export type ValidatedRow =
  | { ok: true; data: Record<string, unknown>; /** Raw mapped values, for dupe/resolution display. */ raw: Record<string, string> }
  | { ok: false; errors: RowError[]; raw: Record<string, string> }

/** Coerce a string cell to the field's target type. Throws on bad input. */
export function coerceCell(value: string, field: EntityField): unknown {
  const v = value.trim()
  switch (field.type) {
    case 'string':
    case 'text':
      return v
    case 'email':
      return v.toLowerCase()
    case 'integer': {
      if (v === '') return undefined
      const n = Number(v)
      if (!Number.isFinite(n) || !/^-?\d+(\.0+)?$/.test(v.trim())) {
        throw new Error(`"${v}" is not a whole number`)
      }
      return Math.trunc(n)
    }
    case 'decimal': {
      if (v === '') return undefined
      const n = Number(v.replace(/[$,]/g, ''))
      if (!Number.isFinite(n)) throw new Error(`"${v}" is not a number`)
      return n
    }
    case 'cents': {
      if (v === '') return undefined
      const n = Number(v.replace(/[$,]/g, ''))
      if (!Number.isFinite(n)) throw new Error(`"${v}" is not a valid amount`)
      return Math.round(n * 100)
    }
    case 'boolean': {
      if (v === '') return undefined
      const t = v.toLowerCase()
      if (['true', 'yes', 'y', '1', 't'].includes(t)) return true
      if (['false', 'no', 'n', '0', 'f'].includes(t)) return false
      throw new Error(`"${v}" is not a yes/no value`)
    }
    case 'enum': {
      if (v === '') return undefined
      const canon = resolveEnum(v, field)
      if (canon === undefined) {
        throw new Error(`"${v}" is not one of: ${(field.enumValues ?? []).join(', ')}`)
      }
      return canon
    }
    case 'date': {
      if (v === '') return undefined
      const d = parseDateLoose(v)
      if (!d) throw new Error(`"${v}" is not a recognizable date`)
      return d
    }
    default:
      return v
  }
}

function resolveEnum(raw: string, field: EntityField): string | undefined {
  const v = raw.toLowerCase().trim()
  const aliases = field.enumAliases ?? {}
  if (aliases[v]) return aliases[v]
  // Exact canonical match.
  const exact = field.enumValues?.find((ev) => ev.toLowerCase() === v)
  if (exact) return exact
  // Canonical label-ish match (replace underscores with spaces).
  const spaced = field.enumValues?.find(
    (ev) => ev.toLowerCase().replace(/_/g, ' ') === v,
  )
  if (spaced) return spaced
  // Prefix match (e.g. "condenser" -> ac_condenser via alias already covered).
  const aliasKeys = Object.keys(aliases)
  const prefixHit = aliasKeys.find((k) => v === k || v.includes(k))
  if (prefixHit) return aliases[prefixHit]
  return undefined
}

/** Accept ISO, YYYY-MM-DD, MM/DD/YYYY, DD/MM/YYYY (when unambiguous). */
function parseDateLoose(v: string): string | null {
  const s = v.trim()
  // ISO.
  const dIso = new Date(s)
  if (!isNaN(dIso.getTime()) && /\d{4}-\d{2}-\d{2}/.test(s)) {
    return dIso.toISOString()
  }
  // US: M/D/YYYY or M-D-YYYY.
  const us = s.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})$/)
  if (us) {
    const [, m, d, y] = us
    const year = y.length === 2 ? 2000 + Number(y) : Number(y)
    const dt = new Date(year, Number(m) - 1, Number(d))
    if (!isNaN(dt.getTime())) return dt.toISOString()
  }
  return null
}

/**
 * Validate a single mapped row. Coerces each mapped field, enforces required
 * fields, then runs the entity's Zod schema. Returns a discriminated result.
 */
export function validateRow(
  raw: Record<string, string>,
  spec: EntitySpec,
): ValidatedRow {
  const errors: RowError[] = []
  const coerced: Record<string, unknown> = {}

  for (const field of spec.fields) {
    const value = raw[field.key] ?? ''
    if (value === '' || value === undefined) {
      if (field.required) {
        errors.push({ field: field.key, message: `${field.label} is required` })
      }
      continue
    }
    try {
      const out = coerceCell(value, field)
      if (out !== undefined) coerced[field.key] = out
    } catch (e) {
      errors.push({
        field: field.key,
        message: (e as Error).message,
      })
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors, raw }
  }

  const parsed = spec.schema.safeParse(coerced)
  if (!parsed.success) {
    const zodErrors: RowError[] = parsed.error.issues.map((i) => ({
      field: i.path.join('.'),
      message: i.message,
    }))
    return { ok: false, errors: zodErrors, raw }
  }

  return { ok: true, data: parsed.data, raw }
}

export function validateRows(
  mapped: Record<string, string>[],
  spec: EntitySpec,
): ValidatedRow[] {
  return mapped.map((row) => validateRow(row, spec))
}
