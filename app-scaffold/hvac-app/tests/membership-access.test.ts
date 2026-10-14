import { beforeEach, describe, expect, it, vi } from 'vitest'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { enrollCustomer, pauseMembership } from '@/lib/memberships'
import { POST } from '@/app/api/memberships/route'
import { PATCH } from '@/app/api/memberships/[membershipId]/route'
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/db', () => ({ db: { organizationMember: { findFirst: vi.fn() }, customer: { findFirst: vi.fn() }, recurringJob: { findFirst: vi.fn() } } }))
vi.mock('@/lib/memberships', () => ({ enrollCustomer: vi.fn(), pauseMembership: vi.fn(), cancelMembership: vi.fn(), listMembershipsForOrg: vi.fn() }))
const post = (body: unknown) => POST(new Request('http://localhost/api/memberships', { method: 'POST', body: JSON.stringify(body) }))
beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(auth).mockResolvedValue({ user: { id: 'user1' } } as never)
  vi.mocked(db.organizationMember.findFirst).mockResolvedValue({ organizationId: 'org1', role: 'owner', organization: {
    subscriptionStatus: 'ACTIVE', readOnlyAt: null, trialEndsAt: null,
  } } as never)
  vi.mocked(db.customer.findFirst).mockResolvedValue({ id: 'customer1' } as never)
  vi.mocked(enrollCustomer).mockResolvedValue({ id: 'membership1' } as never)
})
describe('membership API tenant boundaries', () => {
  it('rejects foreign customer IDs before enrollment', async () => {
    vi.mocked(db.customer.findFirst).mockResolvedValue(null)
    expect((await post({ customerId: 'foreign' })).status).toBe(404)
    expect(db.customer.findFirst).toHaveBeenCalledWith({ where: { id: 'foreign', organizationId: 'org1', deletedAt: null } })
    expect(enrollCustomer).not.toHaveBeenCalled()
  })
  it('requires a recurring schedule to belong to this exact customer and workspace', async () => {
    vi.mocked(db.recurringJob.findFirst).mockResolvedValue(null)
    expect((await post({ customerId: 'customer1', recurringJobId: 'foreign' })).status).toBe(404)
    expect(db.recurringJob.findFirst).toHaveBeenCalledWith({ where: { id: 'foreign', customerId: 'customer1', organizationId: 'org1' } })
    expect(enrollCustomer).not.toHaveBeenCalled()
  })
  it('discards a forged tenant ID on otherwise valid enrollment', async () => {
    expect((await post({ customerId: 'customer1', organizationId: 'forged' })).status).toBe(200)
    expect(enrollCustomer).toHaveBeenCalledWith({ organizationId: 'org1', userId: 'user1', input: { customerId: 'customer1' } })
  })
  it('denies technicians membership changes', async () => {
    vi.mocked(db.organizationMember.findFirst).mockResolvedValue({ organizationId: 'org1', role: 'technician' } as never)
    expect((await post({ customerId: 'customer1' })).status).toBe(403)
    expect(enrollCustomer).not.toHaveBeenCalled()
  })
  it('returns 404 for a foreign membership instead of false success', async () => {
    vi.mocked(pauseMembership).mockResolvedValue({ count: 0 })
    const res = await PATCH(new Request('http://localhost/api/memberships/foreign', { method: 'PATCH', body: JSON.stringify({ action: 'pause' }) }), { params: Promise.resolve({ membershipId: 'foreign' }) })
    expect(res.status).toBe(404)
    expect(pauseMembership).toHaveBeenCalledWith({ organizationId: 'org1', membershipId: 'foreign' })
  })
  it('returns a controlled response for malformed JSON', async () => {
    const res = await POST(new Request('http://localhost/api/memberships', { method: 'POST', body: '{' }))
    expect(res.status).toBe(400)
    expect(enrollCustomer).not.toHaveBeenCalled()
  })
})
