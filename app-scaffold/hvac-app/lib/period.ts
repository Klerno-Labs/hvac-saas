export type Period = 'month' | 'quarter' | 'ytd' | 'last30'

const VALID_PERIODS: Period[] = ['month', 'quarter', 'ytd', 'last30']

export function resolvePeriod(raw: string | string[] | undefined): {
  period: Period
  start: Date
  end: Date
} {
  const now = new Date()
  const input = typeof raw === 'string' ? raw : undefined
  const period: Period = VALID_PERIODS.includes(input as Period) ? (input as Period) : 'month'

  let start: Date
  const end = new Date(now)

  switch (period) {
    case 'quarter': {
      const q = Math.floor(now.getMonth() / 3)
      start = new Date(now.getFullYear(), q * 3, 1)
      break
    }
    case 'ytd': {
      start = new Date(now.getFullYear(), 0, 1)
      break
    }
    case 'last30': {
      start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
      break
    }
    default: {
      start = new Date(now.getFullYear(), now.getMonth(), 1)
      break
    }
  }

  return { period, start, end }
}
