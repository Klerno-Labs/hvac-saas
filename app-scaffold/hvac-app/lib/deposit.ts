export function resolveDepositCents(
  totalCents: number,
  depositType: string | null | undefined,
  depositPercent: number | null | undefined,
  depositFixedCents: number | null | undefined,
): number {
  if (depositType === 'percent' && depositPercent != null) {
    return Math.round(totalCents * depositPercent)
  }
  if (depositType === 'fixed' && depositFixedCents != null) {
    return depositFixedCents
  }
  return 0
}

export function computeDepositApplicationFeeCents(depositCents: number, feePercent: number): number {
  const fee = Math.round(depositCents * (feePercent / 100))
  return fee > 0 ? fee : 0
}

export function formatDepositLabel(
  depositRequired: boolean,
  depositStatus: string,
  depositPaidAt: Date | null | undefined,
  depositCents: number,
): string | null {
  if (!depositRequired) return null
  if (depositStatus === 'paid' && depositPaidAt) {
    return `Deposit paid on ${new Date(depositPaidAt).toLocaleDateString()}`
  }
  return `Deposit due on approval: $${(depositCents / 100).toFixed(2)}`
}
