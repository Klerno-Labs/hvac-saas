export function computeDepositApplicationFeeCents(depositCents: number, feePercent: number): number {
  if (depositCents <= 0) return 0
  return Math.round(depositCents * (feePercent / 100))
}
