type ResolveDepositInput = {
  depositType: string | null | undefined
  depositPercent: number | null | undefined
  depositFixedCents: number | null | undefined
  totalCents: number
}

export function resolveDepositCents({
  depositType,
  depositPercent,
  depositFixedCents,
  totalCents,
}: ResolveDepositInput): number {
  if (depositType === 'percent' && depositPercent != null) {
    return Math.max(0, Math.min(totalCents, Math.round((totalCents * depositPercent) / 100)))
  }
  if (depositType === 'fixed' && depositFixedCents != null) {
    return Math.max(0, Math.min(totalCents, depositFixedCents))
  }
  return 0
}
