type EstimateDepositInput = {
  totalCents: number
  depositType: string | null
  depositPercent: number | null
  depositFixedCents: number | null
}

export function resolveDepositCents(e: EstimateDepositInput): number {
  if (e.depositType === 'percent' && e.depositPercent !== null) {
    return Math.round(e.totalCents * (e.depositPercent / 100))
  }
  if (e.depositType === 'fixed' && e.depositFixedCents !== null) {
    return e.depositFixedCents
  }
  return 0
}

export function computeDepositApplicationFeeCents(depositCents: number, feePercent = 2.9): number {
  return Math.round(depositCents * (feePercent / 100))
}

export function formatDepositLabel(opts: {
  depositRequired: boolean
  depositCents: number
  depositStatus: string | null
  depositPaidAt: Date | string | null
}): string | null {
  if (!opts.depositRequired) return null
  const fmt = (c: number) => '$' + (c / 100).toFixed(2)
  if (opts.depositStatus === 'paid' && opts.depositPaidAt) {
    const d = new Date(opts.depositPaidAt).toLocaleDateString()
    return `Deposit paid on ${d}`
  }
  return `Deposit due on approval: ${fmt(opts.depositCents)}`
}
