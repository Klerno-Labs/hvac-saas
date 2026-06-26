export type Period = 'month' | 'quarter' | 'ytd' | 'last30'

export function resolvePeriod(raw: string | string[] | undefined): Period {
  const val = Array.isArray(raw) ? raw[0] : raw
  if (val === 'quarter' || val === 'ytd' || val === 'last30') return val
  return 'month'
}

export function periodDateRange(period: Period): { start: Date; end: Date } {
  const now = new Date()
  const end = new Date(now)
  let start: Date

  if (period === 'last30') {
    start = new Date(now)
    start.setDate(start.getDate() - 30)
  } else if (period === 'ytd') {
    start = new Date(now.getFullYear(), 0, 1)
  } else if (period === 'quarter') {
    const q = Math.floor(now.getMonth() / 3)
    start = new Date(now.getFullYear(), q * 3, 1)
  } else {
    start = new Date(now.getFullYear(), now.getMonth(), 1)
  }

  return { start, end }
}
