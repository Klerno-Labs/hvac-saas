export function resolveDepositCents(input: {
  depositType: 'percent' | 'fixed' | null | undefined
  depositPercent?: number | null
  depositFixedCents?: number | null
  totalCents: number
}): number {
  const { depositType, depositPercent, depositFixedCents, totalCents } = input
  if (!depositType) return 0
  if (depositType === 'percent') {
    const pct = depositPercent ?? 0
    if (pct <= 0) return 0
    return Math.min(Math.max(Math.round(totalCents * pct / 100), 0), totalCents)
  }
  if (depositType === 'fixed') {
    const fixed = depositFixedCents ?? 0
    return Math.min(Math.max(fixed, 0), totalCents)
  }
  return 0
}
