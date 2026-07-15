type DepositInput = {
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
}: DepositInput): number {
  if (depositType === 'percent' && depositPercent != null) {
    return Math.min(Math.max(Math.round((totalCents * depositPercent) / 100), 0), totalCents)
  }
  if (depositType === 'fixed' && depositFixedCents != null) {
    return Math.min(Math.max(depositFixedCents, 0), totalCents)
  }
  return 0
}
