import { z } from 'zod'

// OptionGroup import is out of scope for v1 — items import as flat-priced only.

export const importRowSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  category: z.string().max(100).optional(),
  description: z.string().max(2000).optional(),
  flatPriceCents: z.number().int().min(0, 'flatPrice must be 0 or more'),
  costCents: z.number().int().min(0, 'cost must be 0 or more').optional(),
  imageUrl: z.string().max(1000).optional(),
})

export type ParsedRow = z.infer<typeof importRowSchema>

export type ParseError = { line: number; message: string }

function splitCsvLine(line: string): string[] {
  const fields: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { current += '"'; i++ }
        else inQuotes = false
      } else {
        current += ch
      }
    } else {
      if (ch === '"') inQuotes = true
      else if (ch === ',') { fields.push(current); current = '' }
      else current += ch
    }
  }
  fields.push(current)
  return fields
}

export function parsePriceBookCsv(csvText: string): { rows: ParsedRow[]; errors: ParseError[] } {
  const rows: ParsedRow[] = []
  const errors: ParseError[] = []

  const lines = csvText.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0)
  if (lines.length === 0) return { rows, errors }

  const headers = splitCsvLine(lines[0]).map(h => h.trim().toLowerCase())
  const col = (fields: string[], name: string): string => {
    const idx = headers.indexOf(name)
    return idx >= 0 ? (fields[idx]?.trim() ?? '') : ''
  }

  for (let i = 1; i < lines.length; i++) {
    const lineNum = i + 1
    const fields = splitCsvLine(lines[i])

    const name = col(fields, 'name')
    const category = col(fields, 'category') || undefined
    const description = col(fields, 'description') || undefined
    const imageUrl = col(fields, 'imageurl') || undefined

    const flatPriceStr = col(fields, 'flatprice')
    const costStr = col(fields, 'cost')

    const flatPriceCents = flatPriceStr !== '' ? Math.round(parseFloat(flatPriceStr) * 100) : 0
    const costCents = costStr !== '' ? Math.round(parseFloat(costStr) * 100) : undefined

    const parsed = importRowSchema.safeParse({ name, category, description, imageUrl, flatPriceCents, costCents })
    if (parsed.success) {
      rows.push(parsed.data)
    } else {
      errors.push({ line: lineNum, message: parsed.error.errors[0].message })
    }
  }

  return { rows, errors }
}
