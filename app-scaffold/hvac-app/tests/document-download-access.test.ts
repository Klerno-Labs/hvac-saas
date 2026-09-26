import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { validatePortalToken } from '@/lib/portal'
import { GET as estimatePdf } from '@/app/api/estimates/[estimateId]/pdf/route'
import { GET as invoicePdf } from '@/app/api/invoices/[invoiceId]/pdf/route'
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
})
const cases = [
  ['estimate', (req: NextRequest) => estimatePdf(req, { params: Promise.resolve({ estimateId: 'document1' }) }), () => db.estimate.findFirst],
  ['invoice', (req: NextRequest) => invoicePdf(req, { params: Promise.resolve({ invoiceId: 'document1' }) }), () => db.invoice.findFirst],
] as const
for (const [label, get, query] of cases) {
  describe(`${label} document download boundaries`, () => {
    it('scopes a guessed document ID to the technician assignment', async () => {
      expect((await get(new NextRequest('http://localhost/api/pdf'))).status).toBe(404)
      expect(query()).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({
        id: 'document1', organizationId: 'org1', job: { organizationId: 'org1', assignedUserId: 'tech1' },
      }) }))
    })
    it('never renders draft documents through a customer token', async () => {
      expect((await get(new NextRequest('http://localhost/api/pdf?token=valid'))).status).toBe(404)
      expect(query()).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ organizationId: 'org1', status: { not: 'draft' } }) }))
      expect(auth).not.toHaveBeenCalled()
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
  })
}
