import { z } from 'zod'

// Option-group import is out of scope for v1 — each CSV row maps to a single
// flat-priced PriceBookItem. Grouped/tiered pricing can be added in a later pass.

export const importRowSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  category: z.string().max(100).optional(),
  description: z.string().max(2000).optional(),
  flatPriceCents: z.number().int().min(0, 'flatPrice must be 0 or more'),
  costCents: z.number().int().min(0, 'cost must be 0 or more').optional(),
  imageUrl: z.string().max(1000).optional(),
})

export type ParsedRow = z.infer<typeof importRowSchema>
export type ImportRowError = { line: number; message: string }

// Splits one CSV line into fields, handling commas inside double-quoted values
// and "" as an escaped double-quote inside a quoted field.
function splitCsvLine(line: string): string[] {
  const fields: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (ch === ',' && !inQuotes) {
      fields.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  fields.push(current)
  return fields
}

const MAX_IMPORT_ROWS = 5000

export function parsePriceBookCsv(csvText: string): {
  rows: ParsedRow[]
  errors: ImportRowError[]
} {
  const rows: ParsedRow[] = []
  const errors: ImportRowError[] = []

  const lines = csvText.split(/\r?\n/)

  // Find the first non-blank line and treat it as the header.
  let headerIndex = -1
  let headers: string[] = []
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === '') continue
    headerIndex = i
    headers = splitCsvLine(lines[i].trim()).map((h) => h.trim().toLowerCase())
    break
  }

  if (headerIndex === -1) {
    return { rows: [], errors: [] }
  }

  const nameIdx = headers.indexOf('name')
  const categoryIdx = headers.indexOf('category')
  const descriptionIdx = headers.indexOf('description')
  const flatPriceIdx = headers.indexOf('flatprice')
  const costIdx = headers.indexOf('cost')
  const imageUrlIdx = headers.indexOf('imageurl')

  if (nameIdx === -1) {
    errors.push({ line: headerIndex + 1, message: 'Missing required column: name' })
    return { rows, errors }
  }
  if (flatPriceIdx === -1) {
    errors.push({ line: headerIndex + 1, message: 'Missing required column: flatPrice' })
    return { rows, errors }
  }

  let dataRowCount = 0

  for (let i = headerIndex + 1; i < lines.length; i++) {
    const lineNum = i + 1
    if (lines[i].trim() === '') continue

    if (dataRowCount >= MAX_IMPORT_ROWS) {
      errors.push({ line: lineNum, message: `Import capped at ${MAX_IMPORT_ROWS} rows; remaining rows ignored` })
      break
    }
    dataRowCount++

    const fields = splitCsvLine(lines[i])

    const name = (fields[nameIdx] ?? '').trim()
    const flatPriceRaw = (fields[flatPriceIdx] ?? '').trim()
    const flatPriceCents = flatPriceRaw !== '' ? Math.round(parseFloat(flatPriceRaw) * 100) : 0

    const costRaw = costIdx >= 0 ? (fields[costIdx] ?? '').trim() : ''
    const costCents = costRaw !== '' ? Math.round(parseFloat(costRaw) * 100) : undefined

    const category = categoryIdx >= 0 ? (fields[categoryIdx] ?? '').trim() || undefined : undefined
    const description = descriptionIdx >= 0 ? (fields[descriptionIdx] ?? '').trim() || undefined : undefined
    const imageUrl = imageUrlIdx >= 0 ? (fields[imageUrlIdx] ?? '').trim() || undefined : undefined

    const result = importRowSchema.safeParse({
      name,
      category,
      description,
      flatPriceCents,
      costCents,
      imageUrl,
    })

    if (!result.success) {
      errors.push({
        line: lineNum,
        message: result.error.errors.map((e) => e.message).join('; '),
      })
      continue
    }

    rows.push(result.data)
  }

  return { rows, errors }
}
