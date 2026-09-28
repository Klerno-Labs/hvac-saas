import { describe, expect, it } from 'vitest'
import { isValidElement, type ReactNode } from 'react'
import { EstimatePdf } from '@/lib/pdf/estimate-pdf'
import { InvoicePdf } from '@/lib/pdf/invoice-pdf'

function textContent(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textContent).join(' ')
  if (isValidElement<{ children?: ReactNode }>(node)) return textContent(node.props.children)
  return ''
}

const common = {
  orgName: 'Sample shop', status: 'sent', createdAt: new Date('2026-09-26T12:00:00Z'),
  customerName: 'Alex Sample', customerAddress: '', customerEmail: null, customerPhone: null,
  subtotalCents: 12500, taxCents: 0, totalCents: 12500,
  lineItems: [{ name: 'Service visit', description: 'Diagnostic visit', quantity: 1, unitPriceCents: 12500, lineTotalCents: 12500 }],
  // Extra runtime data must not become visible even if a future caller spreads a database row.
  notes: 'Private supplier margin discussion',
}

describe('shareable document content', () => {
  it('keeps estimate scope, terms and pricing while omitting internal notes', () => {
    const text = textContent(EstimatePdf({ ...common, estimateNumber: 'EST-0001', scopeOfWork: 'Repair the equipment', terms: 'Due on completion' }))
    expect(text).toContain('Repair the equipment')
    expect(text).toContain('Due on completion')
    expect(text).toContain('Service visit')
    expect(text).toContain('$125.00')
    expect(text).not.toContain(common.notes)
  })

  it('keeps invoice work, due date and pricing while omitting internal notes', () => {
    const text = textContent(InvoicePdf({ ...common, invoiceNumber: 'INV-0001', dueDate: new Date('2026-10-01T00:00:00Z'), descriptionOfWork: 'Completed equipment repair', outstandingCents: 12500 }))
    expect(text).toContain('Completed equipment repair')
    expect(text).toContain('Due')
    expect(text).toContain('Service visit')
    expect(text).toContain('$125.00')
    expect(text).not.toContain(common.notes)
  })
})
