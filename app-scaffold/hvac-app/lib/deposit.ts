export function formatDepositLabel(
  depositAmountCents: number,
  depositStatus: string | null,
): string {
  if (!depositAmountCents) return ''
  if (depositStatus === 'paid') return 'Deposit paid'
  return `Deposit due on approval: $${(depositAmountCents / 100).toFixed(2)}`
}
