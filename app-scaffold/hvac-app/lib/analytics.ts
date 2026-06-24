type PeriodKey = '7d' | '30d' | '90d' | 'all'

export function getDateRange(period: PeriodKey): { start: Date; end: Date } {
  const end = new Date()
  const start = new Date()
  
  switch (period) {
    case '7d':
      start.setDate(start.getDate() - 7)
      break
    case '30d':
      start.setDate(start.getDate() - 30)
      break
    case '90d':
      start.setDate(start.getDate() - 90)
      break
    case 'all':
      start.setFullYear(start.getFullYear() - 10)
      break
  }
  
  return { start, end }
}

export function calculateAverageTicket(invoices: { totalCents: number }[]): number {
  if (invoices.length === 0) return 0
  return invoices.reduce((sum, inv) => sum + inv.totalCents, 0) / invoices.length
}

export function calculateARAging(
  invoices: { outstandingCents: number; dueDate: Date | null }[],
  organization: { collectionsOverdue1Days: number; collectionsOverdue2Days: number }
) {
  const now = new Date()
  const current: number[] = []
  const overdue1: number[] = []
  const overdue2: number[] = []
  const overdue3: number[] = []

  invoices.forEach(inv => {
    if (!inv.dueDate) {
      current.push(inv.outstandingCents)
      return
    }

    const daysOverdue = Math.floor((now.getTime() - new Date(inv.dueDate).getTime()) / (1000 * 60 * 60 * 24))

    if (daysOverdue <= 0) {
      current.push(inv.outstandingCents)
    } else if (daysOverdue <= organization.collectionsOverdue1Days) {
      overdue1.push(inv.outstandingCents)
    } else if (daysOverdue <= organization.collectionsOverdue2Days) {
      overdue2.push(inv.outstandingCents)
    } else {
      overdue3.push(inv.outstandingCents)
    }
  })

  return {
    current: current.reduce((sum, amt) => sum + amt, 0),
    overdue1: overdue1.reduce((sum, amt) => sum + amt, 0),
    overdue2: overdue2.reduce((sum, amt) => sum + amt, 0),
    overdue3: overdue3.reduce((sum, amt) => sum + amt, 0),
  }
}