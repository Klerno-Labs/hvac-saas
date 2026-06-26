export function formatDepositLabel(
  depositAmountCents: number | null | undefined,
  depositStatus: string | null | undefined,
): string {
  if (!depositAmountCents || depositAmountCents <= 0) return ''
  if (depositStatus === 'paid') return 'Deposit paid'
  return `Deposit due on approval: $${(depositAmountCents / 100).toFixed(2)}`
}
