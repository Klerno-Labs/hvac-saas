import type { AgingBuckets } from '@/lib/owner-analytics'

export function formatCloseRate(sent: number, won: number): string {
  if (sent === 0) return '0%'
  return Math.round((won / sent) * 100) + '%'
}

export function agingTotal(aging: AgingBuckets): number {
  return (
    aging.currentCents +
    aging.days1to30Cents +
    aging.days31to60Cents +
    aging.days61to90Cents +
    aging.days90plusCents
  )
}
