import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ send: vi.fn() }))
vi.mock('resend', () => ({ Resend: class { emails = { send: mocks.send } } }))
vi.mock('@/lib/db', () => ({ db: { estimate: { findMany: vi.fn() }, invoice: { findMany: vi.fn(), findFirst: vi.fn() } } }))
vi.mock('@/lib/portal', () => ({ validatePortalToken: vi.fn(async () => ({ organizationId: 'org1', customerId: 'customer1', customerName: 'Test Customer', organizationName: 'Test Shop' })) }))
vi.mock('@/lib/events', () => ({ trackEvent: vi.fn() }))
vi.mock('@/lib/rate-limit', () => ({ limit: vi.fn(async () => ({ allowed: true })), RL: { portalToken: {} }, extractIp: vi.fn(() => '127.0.0.1') }))
vi.mock('next/headers', () => ({ headers: vi.fn(async () => new Headers()) }))
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('Not found') } }))
vi.mock('next/link', () => ({ default: ({ children, ...props }: React.ComponentProps<'a'>) => React.createElement('a', props, children) }))
vi.mock('@/app/portal/[token]/invoices/[invoiceId]/portal-pay-button', () => ({ PortalPayButton: () => React.createElement('button', null, 'Pay now') }))

import { db } from '@/lib/db'
import { sendInvoiceEmail } from '@/lib/email'
import PortalDashboardPage from '@/app/portal/[token]/page'
import PortalInvoiceDetailPage from '@/app/portal/[token]/invoices/[invoiceId]/page'

const document = {
  id: 'invoice1', invoiceNumber: 'INV-TEST', status: 'sent', subtotalCents: 10000, taxCents: 0,
  totalCents: 10000, outstandingCents: 0, dueDate: new Date('2026-01-01T00:00:00Z'), paidAt: null,
  descriptionOfWork: 'Internal test invoice', lineItems: [], job: { title: 'Internal test job' },
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('RESEND_API_KEY', 'unit-test-key')
  vi.mocked(db.estimate.findMany).mockResolvedValue([])
  mocks.send.mockResolvedValue({ data: { id: 'message1' }, error: null })
})
afterEach(() => vi.unstubAllEnvs())

describe.each([
  { status: 'sent', outstandingCents: 0, label: 'No payment due', paymentExpected: false },
  { status: 'overdue', outstandingCents: 0, label: 'No payment due', paymentExpected: false },
  { status: 'sent', outstandingCents: 10000, label: 'Awaiting payment', paymentExpected: true },
  { status: 'overdue', outstandingCents: 2500, label: 'Overdue', paymentExpected: true },
  { status: 'paid', outstandingCents: 0, label: 'Paid', paymentExpected: false },
  { status: 'void', outstandingCents: 0, label: 'Cancelled', paymentExpected: false },
  { status: 'void', outstandingCents: 10000, label: 'Cancelled', paymentExpected: false },
])('customer invoice with $status and balance $outstandingCents cents', ({ status, outstandingCents, label, paymentExpected }) => {
  it('keeps the invoice visible while limiting the dashboard payment-needed section to collectible balances', async () => {
    vi.mocked(db.invoice.findMany).mockResolvedValue([{ ...document, status, outstandingCents }] as never)
    const html = renderToStaticMarkup(await PortalDashboardPage({ params: Promise.resolve({ token: 'test-token' }) }))
    expect(html).toContain('INV-TEST')
    expect(html).toContain(label)
    expect(html.includes('Payment needed')).toBe(paymentExpected)
    if (status === 'paid' || status === 'void') expect(html).not.toContain('No payment due')
  })

  it('only renders a payment action for an issued invoice with a positive balance', async () => {
    vi.mocked(db.invoice.findFirst).mockResolvedValue({ ...document, status, outstandingCents } as never)
    const html = renderToStaticMarkup(await PortalInvoiceDetailPage({ params: Promise.resolve({ token: 'test-token', invoiceId: document.id }) }))
    expect(html).toContain('INV-TEST')
    expect(html).toContain(label)
    expect(html.includes('Pay this invoice')).toBe(paymentExpected)
    expect(html.includes('Pay now')).toBe(paymentExpected)
    expect(html.includes('Amount due:')).toBe(paymentExpected)
  })
})

describe('invoice email payment wording', () => {
  it.each([0, 2500])('uses the outstanding balance rather than the original total (%s cents due)', async outstandingCents => {
    await sendInvoiceEmail({ to: 'test@example.test', customerName: 'Test Customer', orgName: 'Test Shop', invoiceNumber: 'INV-TEST',
      totalFormatted: '$100.00', outstandingCents, dueDate: 'Jan 1, 2026', portalUrl: 'https://example.test/portal/test' })
    const html = mocks.send.mock.calls[0][0].html as string
    expect(html).toContain('$100.00')
    if (outstandingCents === 0) {
      expect(html).toContain('No payment is due.')
      expect(html).toContain('View Invoice')
      expect(html).not.toContain('View &amp; Pay Invoice')
      expect(html).not.toContain('view and pay')
      expect(html).not.toContain('Payment due:')
    } else {
      expect(html).toContain('View &amp; Pay Invoice')
      expect(html).toContain('Payment due:')
      expect(html).not.toContain('No payment is due.')
    }
    expect(mocks.send).toHaveBeenCalledTimes(1)
  })
})
