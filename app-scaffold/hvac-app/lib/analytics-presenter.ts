import type { OwnerAnalytics } from '@/lib/owner-analytics'

export function formatCloseRate(rate: number): string {
  if (!Number.isFinite(rate)) return '0%'
  return Math.round(rate * 100) + '%'
}

export function agingTotal(aging: OwnerAnalytics['aging']): number {
  return aging.current + aging.days1_30 + aging.days31_60 + aging.days61_90 + aging.days90plus
}
