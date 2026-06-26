export function visitsLabel(used: number, included: number): string {
  return `${used} / ${included} visits used`
}

export function planPriceLabel(cents: number): string {
  return '$' + (cents / 100).toFixed(2)
}

export function cadenceLabel(cadence: string): string {
  switch (cadence) {
    case 'monthly': return 'Monthly'
    case 'quarterly': return 'Quarterly'
    case 'biannual': return 'Biannual'
    case 'annual': return 'Annual'
    default: return cadence
  }
}
