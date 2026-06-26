export function calculateNextDueDate(current: Date, frequency: string): Date {
  const next = new Date(current)

  switch (frequency) {
    case 'monthly':
      next.setMonth(next.getMonth() + 1)
      break
    case 'quarterly':
      next.setMonth(next.getMonth() + 3)
      break
    case 'biannual':
      next.setMonth(next.getMonth() + 6)
      break
    case 'annual':
      next.setFullYear(next.getFullYear() + 1)
      break
    default:
      next.setMonth(next.getMonth() + 1)
  }

  return next
}
