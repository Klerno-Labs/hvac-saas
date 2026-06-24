import Papa from 'papaparse'

export type ParsedCsv = {
  headers: string[]
  /** Rows as arrays aligned to `headers` (short rows are padded with ''). */
  rows: string[][]
}

/**
 * Parse CSV text into headers + rows using papaparse (RFC-4180 compliant:
 * handles quoted fields, embedded commas/newlines, escaped quotes).
 *
 * - The first non-empty line is treated as the header row.
 * - Trailing all-whitespace rows are dropped.
 * - Ragged rows are right-padded so every row aligns to headers.length.
 */
export function parseCsv(text: string): ParsedCsv {
  const result = Papa.parse<string[]>(text.trim(), {
    skipEmptyLines: 'greedy',
  })

  const grid = (result.data as string[][]).filter(
    (row) => Array.isArray(row) && row.some((cell) => trim(cell) !== ''),
  )

  if (grid.length === 0) {
    return { headers: [], rows: [] }
  }

  const headers = grid[0].map((h) => trim(h))
  const width = headers.length

  const rows = grid.slice(1).map((row) => {
    const padded = row.slice(0, width)
    while (padded.length < width) padded.push('')
    return padded
  })

  return { headers, rows }
}

function trim(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}
