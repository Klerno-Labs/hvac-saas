export function resolveDepositCents(input: {
  depositType: 'percent' | 'fixed' | null | undefined;
  depositPercent?: number | null;
  depositFixedCents?: number | null;
  totalCents: number;
}): number {
  const { depositType, depositPercent, depositFixedCents, totalCents } = input;
  if (!depositType) return 0;
  if (depositType === 'percent') {
    const pct = depositPercent ?? 0;
    if (pct <= 0) return 0;
    return Math.max(0, Math.min(Math.round(totalCents * pct / 100), totalCents));
  }
  if (depositType === 'fixed') {
    return Math.max(0, Math.min(depositFixedCents ?? 0, totalCents));
  }
  return 0;
}
