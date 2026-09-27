import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('@/lib/db', () => ({ db: { customer: { findFirst: vi.fn() }, portalToken: { create: vi.fn(), updateMany: vi.fn() } } }))
vi.mock('@/lib/require-admin', () => ({ requireAdmin: vi.fn() }))
vi.mock('@/lib/events', () => ({ trackEvent: vi.fn() }))
vi.mock('@/lib/audit', () => ({ logAudit: vi.fn() }))
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/require-admin'
import { generatePortalLink, revokePortalTokens } from '@/app/customers/[customerId]/portal-actions'

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(requireAdmin).mockResolvedValue({ authorized: true, context: { userId: 'owner1', userEmail: null, organizationId: 'org1', role: 'owner' } })
})

describe('owner portal capabilities', () => {
  it('does not issue a link to a deleted or unrelated customer', async () => {
    vi.mocked(db.customer.findFirst).mockResolvedValue(null)
    expect(await generatePortalLink('customer1')).toMatchObject({ success: false })
    expect(db.customer.findFirst).toHaveBeenCalledWith({ where: { id: 'customer1', organizationId: 'org1', deletedAt: null } })
    expect(db.portalToken.create).not.toHaveBeenCalled()
  })
  it('still allows revoking historical tokens for a deleted customer', async () => {
    vi.mocked(db.customer.findFirst).mockResolvedValue({ id: 'customer1', deletedAt: new Date() } as never)
    expect(await revokePortalTokens('customer1')).toEqual({ success: true })
    expect(db.portalToken.updateMany).toHaveBeenCalledWith({ where: { customerId: 'customer1', organizationId: 'org1', revokedAt: null }, data: { revokedAt: expect.any(Date) } })
  })
  it('requires the owner before looking up or creating a capability', async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ authorized: false, error: 'Owner required' })
    expect(await generatePortalLink('customer1')).toEqual({ success: false, error: 'Owner required' })
    expect(db.customer.findFirst).not.toHaveBeenCalled()
    expect(db.portalToken.create).not.toHaveBeenCalled()
  })
})
