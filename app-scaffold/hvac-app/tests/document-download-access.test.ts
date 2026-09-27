import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { renderToBuffer } from '@react-pdf/renderer'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { validatePortalToken } from '@/lib/portal'
import { GET as estimatePdf } from '@/app/api/estimates/[estimateId]/pdf/route'
import { GET as invoicePdf } from '@/app/api/invoices/[invoiceId]/pdf/route'
import { EstimatePdf } from '@/lib/pdf/estimate-pdf'
import { InvoicePdf } from '@/lib/pdf/invoice-pdf'
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/db', () => ({ db: { organizationMember: { findFirst: vi.fn() }, estimate: { findFirst: vi.fn() }, invoice: { findFirst: vi.fn() } } }))
vi.mock('@/lib/portal', () => ({ validatePortalToken: vi.fn() }))
vi.mock('@react-pdf/renderer', () => ({ renderToBuffer: vi.fn() }))
vi.mock('@/lib/pdf/estimate-pdf', () => ({ EstimatePdf: vi.fn() }))
vi.mock('@/lib/pdf/invoice-pdf', () => ({ InvoicePdf: vi.fn() }))
beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(auth).mockResolvedValue({ user: { id: 'tech1' } } as never)
  vi.mocked(db.organizationMember.findFirst).mockResolvedValue({ organizationId: 'org1', role: 'technician' } as never)
  vi.mocked(db.estimate.findFirst).mockResolvedValue(null)
  vi.mocked(db.invoice.findFirst).mockResolvedValue(null)
  vi.mocked(validatePortalToken).mockResolvedValue({ organizationId: 'org1', customerId: 'customer1' } as never)
  vi.mocked(renderToBuffer).mockResolvedValue(Buffer.from('%PDF-fixture'))
})
const internalNotes = 'Internal margin and supplier negotiation details'
function fixture(status: 'draft' | 'sent') {
  const customer = { firstName: 'Alex', lastName: 'Sample', email: null, phone: null, addressLine1: null, addressLine2: null, city: null, state: null, postalCode: null }
  return {
    status, customer, job: { customer }, organization: { name: 'Sample shop' },
    estimateNumber: 'EST-0001', invoiceNumber: 'INV-0001', createdAt: new Date('2026-09-26T12:00:00Z'), dueDate: null,
    scopeOfWork: 'Inspect and repair the equipment', descriptionOfWork: 'Completed equipment repair', terms: 'Payment due on completion',
    notes: internalNotes, subtotalCents: 12500, taxCents: 0, totalCents: 12500, outstandingCents: 12500,
    lineItems: [{ name: 'Service visit', description: 'Diagnostic visit', quantity: 1, unitPriceCents: 12500, lineTotalCents: 12500 }],
  }
}
const cases = [
  ['estimate', (req: NextRequest) => estimatePdf(req, { params: Promise.resolve({ estimateId: 'document1' }) }), () => db.estimate.findFirst, EstimatePdf],
  ['invoice', (req: NextRequest) => invoicePdf(req, { params: Promise.resolve({ invoiceId: 'document1' }) }), () => db.invoice.findFirst, InvoicePdf],
] as const
for (const [label, get, query, template] of cases) {
  describe(`${label} document download boundaries`, () => {
    it('scopes a guessed document ID to the technician assignment', async () => {
      expect((await get(new NextRequest('http://localhost/api/pdf'))).status).toBe(404)
      expect(query()).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({
        id: 'document1', organizationId: 'org1', status: { not: 'draft' }, job: { organizationId: 'org1', assignedUserId: 'tech1' },
      }) }))
      expect(renderToBuffer).not.toHaveBeenCalled()
    })
    it('never renders draft documents through a customer token', async () => {
      expect((await get(new NextRequest('http://localhost/api/pdf?token=valid'))).status).toBe(404)
      expect(query()).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ organizationId: 'org1', status: { not: 'draft' } }) }))
      expect(auth).not.toHaveBeenCalled()
      expect(renderToBuffer).not.toHaveBeenCalled()
    })
    it('denies invalid portal tokens before querying documents', async () => {
      vi.mocked(validatePortalToken).mockResolvedValue(null)
      expect((await get(new NextRequest('http://localhost/api/pdf?token=revoked'))).status).toBe(401)
      expect(query()).not.toHaveBeenCalled()
    })
    it('denies unknown roles before querying documents', async () => {
      vi.mocked(db.organizationMember.findFirst).mockResolvedValue({ organizationId: 'org1', role: 'unknown' } as never)
      expect((await get(new NextRequest('http://localhost/api/pdf'))).status).toBe(403)
      expect(query()).not.toHaveBeenCalled()
    })
    it('requires authentication when no portal token is supplied', async () => {
      vi.mocked(auth).mockResolvedValue(null as never)
      expect((await get(new NextRequest('http://localhost/api/pdf'))).status).toBe(401)
      expect(query()).not.toHaveBeenCalled()
      expect(renderToBuffer).not.toHaveBeenCalled()
    })
    it.each(['owner', 'office_admin'])('lets %s download a draft without including internal notes', async role => {
      vi.mocked(db.organizationMember.findFirst).mockResolvedValue({ organizationId: 'org1', role } as never)
      const document = fixture('draft')
      vi.mocked(query()).mockResolvedValue(document as never)

      const response = await get(new NextRequest('http://localhost/api/pdf'))
      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toBe('application/pdf')
      expect(response.headers.get('cache-control')).toBe('private, no-store')
      const where = vi.mocked(query()).mock.calls[0][0]?.where
      expect(where).toMatchObject({ id: 'document1', organizationId: 'org1', job: { organizationId: 'org1' } })
      expect(where).not.toHaveProperty('status')
      expect(template).toHaveBeenCalledWith(expect.objectContaining({ status: 'draft', totalCents: 12500, lineItems: document.lineItems }))
      const props = vi.mocked(template).mock.calls[0][0]
      expect(props).not.toHaveProperty('notes')
      expect(JSON.stringify(props)).not.toContain(internalNotes)
      expect(props).toMatchObject(label === 'estimate' ? { scopeOfWork: document.scopeOfWork, terms: document.terms } : { descriptionOfWork: document.descriptionOfWork })
      expect(document.notes).toBe(internalNotes)
    })
    it('renders a customer-scoped issued document without internal notes', async () => {
      const document = fixture('sent')
      vi.mocked(query()).mockResolvedValue(document as never)
      const response = await get(new NextRequest('http://localhost/api/pdf?token=valid'))
      expect(response.status).toBe(200)
      expect(auth).not.toHaveBeenCalled()
      expect(query()).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({
        organizationId: 'org1', status: { not: 'draft' },
        ...(label === 'estimate' ? { job: { customerId: 'customer1' } } : { customerId: 'customer1' }),
      }) }))
      const props = vi.mocked(template).mock.calls[0][0]
      expect(props).not.toHaveProperty('notes')
      expect(JSON.stringify(props)).not.toContain(internalNotes)
      expect(props).toMatchObject({ status: 'sent', totalCents: 12500, lineItems: document.lineItems })
    })
  })
}
