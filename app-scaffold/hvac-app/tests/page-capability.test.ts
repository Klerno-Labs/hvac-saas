import { beforeEach, describe, expect, it, vi } from 'vitest'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { requirePageCapability } from '@/lib/session'
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/db', () => ({ db: { organizationMember: { findFirst: vi.fn() } } }))
vi.mock('next/navigation', () => ({ redirect: vi.fn((path: string) => { throw new Error(`redirect:${path}`) }) }))
beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(auth).mockResolvedValue({ user: { id: 'user1' } } as never)
})
describe('organization-wide page access', () => {
  it.each(['editPricing', 'manageInventory', 'manageJobs'] as const)('redirects technicians away from %s tools', async capability => {
    vi.mocked(db.organizationMember.findFirst).mockResolvedValue({ role: 'technician', organizationId: 'org1', organization: { subscriptionStatus: 'ACTIVE' } } as never)
    await expect(requirePageCapability(capability)).rejects.toThrow('redirect:/field')
  })
  it('preserves access to organization pricing for office administrators', async () => {
    vi.mocked(db.organizationMember.findFirst).mockResolvedValue({ role: 'office_admin', organizationId: 'org1', organization: { subscriptionStatus: 'ACTIVE' } } as never)
    expect((await requirePageCapability('editPricing')).organizationId).toBe('org1')
  })
})
