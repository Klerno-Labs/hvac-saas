type InvoiceBalance = { status: string; outstandingCents: number }

export function isInvoiceCollectible(invoice: InvoiceBalance): boolean {
  return ['sent', 'overdue'].includes(invoice.status) && invoice.outstandingCents > 0
}

export function customerInvoiceStatus(invoice: InvoiceBalance): string {
  if (['sent', 'overdue'].includes(invoice.status) && invoice.outstandingCents <= 0) return 'No payment due'
  switch (invoice.status) {
    case 'sent': return 'Awaiting payment'
    case 'overdue': return 'Overdue'
    case 'paid': return 'Paid'
    case 'void': return 'Cancelled'
    default: return invoice.status
  }
}
