import { z } from 'zod'
import Papa from 'papaparse'
import { documentCentsSchema } from './document'

// OptionGroup import is out of scope for v1 — items import as flat-priced only.

export const importRowSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  category: z.string().max(100).optional(),
  description: z.string().max(2000).optional(),
  flatPriceCents: documentCentsSchema,
  costCents: documentCentsSchema.optional(),
  imageUrl: z.string().max(1000).optional(),
})

export type ParsedRow = z.infer<typeof importRowSchema>

export type ParseError = { line: number; message: string }

export function parsePriceBookCsv(csvText: string): { rows: ParsedRow[]; errors: ParseError[] } {
  const rows: ParsedRow[] = []
  const errors: ParseError[] = []

  if (!csvText.trim()) return { rows, errors }
  const parsedCsv = Papa.parse<string[]>(csvText, { skipEmptyLines: 'greedy' })
  if (parsedCsv.errors.length) return { rows, errors: parsedCsv.errors.map(error => ({ line: (error.row ?? 0) + 1, message: 'Malformed CSV. Check quotation marks and columns.' })) }
  const records = parsedCsv.data
  const headers = records[0].map(h => h.trim().toLowerCase())
  if (!headers.includes('name') || !headers.includes('flatprice') || new Set(headers).size !== headers.length) {
    return { rows, errors: [{ line: 1, message: 'Include unique name and flatPrice columns.' }] }
  }
  const col = (fields: string[], name: string): string => {
    const idx = headers.indexOf(name)
    return idx >= 0 ? (fields[idx]?.trim() ?? '') : ''
  }

  for (let i = 1; i < records.length; i++) {
    const lineNum = i + 1
    const fields = records[i]
    if (fields.length !== headers.length) { errors.push({ line: lineNum, message: 'Column count does not match the header.' }); continue }

    const name = col(fields, 'name')
    const category = col(fields, 'category') || undefined
    const description = col(fields, 'description') || undefined
    const imageUrl = col(fields, 'imageurl') || undefined

    const flatPriceStr = col(fields, 'flatprice')
    const costStr = col(fields, 'cost')

    const flatPriceCents = flatPriceStr !== '' ? (/^-?\d+(?:\.\d+)?$/.test(flatPriceStr) ? Math.round(Number(flatPriceStr) * 100) : NaN) : 0
    const costCents = costStr !== '' ? (/^-?\d+(?:\.\d+)?$/.test(costStr) ? Math.round(Number(costStr) * 100) : NaN) : undefined

    if (!Number.isFinite(flatPriceCents) || (costCents !== undefined && !Number.isFinite(costCents))) {
      errors.push({ line: lineNum, message: 'Enter a valid numeric price or cost, such as 49.99.' })
      continue
    }
    const parsed = importRowSchema.safeParse({ name, category, description, imageUrl, flatPriceCents, costCents })
    if (parsed.success) {
      rows.push(parsed.data)
    } else {
      errors.push({ line: lineNum, message: parsed.error.errors[0].message })
    }
  }

  return { rows, errors }
}
