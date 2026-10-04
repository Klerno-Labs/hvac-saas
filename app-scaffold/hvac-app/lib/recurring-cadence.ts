export function calculateNextDueDate(current: Date, frequency: string): Date {
  const months = { monthly: 1, quarterly: 3, biannual: 6, annual: 12 }[frequency] ?? 1
  const next = new Date(current)
  const day = current.getUTCDate()
  next.setUTCDate(1)
  next.setUTCMonth(next.getUTCMonth() + months)
  const lastDay = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate()
  next.setUTCDate(Math.min(day, lastDay))
  return next
}
