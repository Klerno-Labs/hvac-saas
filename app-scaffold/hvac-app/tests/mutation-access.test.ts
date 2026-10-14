import { beforeEach, describe, expect, it, vi } from 'vitest'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { requireMutationAccess, jobAccessWhere, customerAccessWhere } from '@/lib/mutation-access'
import { canDo, type Capability } from '@/lib/permissions'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/db', () => ({ db: { organizationMember: { findFirst: vi.fn() } } }))

function membership(overrides: Record<string, unknown> = {}) {
  return { organizationId: 'org-real', role: 'owner', organization: {
    subscriptionStatus: 'ACTIVE', trialEndsAt: null, readOnlyAt: null, ...overrides,
  } }
}
beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(auth).mockResolvedValue({ user: { id: 'user-real', email: 'owner@example.test' } } as never)
  vi.mocked(db.organizationMember.findFirst).mockResolvedValue(membership() as never)
})

describe('operational write access', () => {
  it('derives both identity and tenant from the authenticated membership', async () => {
    const result = await requireMutationAccess('editPricing')
    expect(result.authorized).toBe(true)
    if (!result.authorized) throw new Error('Expected access')
    expect(result.context.organizationId).toBe('org-real')
    expect(result.context.userId).toBe('user-real')
    expect(db.organizationMember.findFirst).toHaveBeenCalledWith({ where: { userId: 'user-real' }, include: { organization: true } })
  })
  it('denies unauthenticated requests before any database lookup', async () => {
    vi.mocked(auth).mockResolvedValue(null as never)
    expect(await requireMutationAccess('fieldWork')).toMatchObject({ authorized: false, status: 401 })
    expect(db.organizationMember.findFirst).not.toHaveBeenCalled()
  })
  it('denies users without an organization', async () => {
    vi.mocked(db.organizationMember.findFirst).mockResolvedValue(null)
    expect(await requireMutationAccess('fieldWork')).toMatchObject({ authorized: false, status: 403 })
  })
  it.each(['CANCELED', 'PAST_DUE', 'UNPAID', 'INCOMPLETE', 'unknown'])('denies %s workspaces', async subscriptionStatus => {
    vi.mocked(db.organizationMember.findFirst).mockResolvedValue(membership({ subscriptionStatus }) as never)
    expect(await requireMutationAccess('manageJobs')).toMatchObject({ authorized: false, error: expect.stringContaining('read-only') })
  })
  it.each([null, new Date(0)])('denies a trial without remaining time (%s)', async trialEndsAt => {
    vi.mocked(db.organizationMember.findFirst).mockResolvedValue(membership({ subscriptionStatus: 'TRIALING', trialEndsAt }) as never)
    expect((await requireMutationAccess('manageJobs')).authorized).toBe(false)
  })
  it('permits an unexpired trial', async () => {
    vi.mocked(db.organizationMember.findFirst).mockResolvedValue(membership({ subscriptionStatus: 'TRIALING', trialEndsAt: new Date(Date.now() + 60_000) }) as never)
    expect((await requireMutationAccess('manageJobs')).authorized).toBe(true)
  })
  it('honors an explicit read-only freeze even when Stripe status is active', async () => {
    vi.mocked(db.organizationMember.findFirst).mockResolvedValue(membership({ readOnlyAt: new Date() }) as never)
    expect((await requireMutationAccess('manageCustomers')).authorized).toBe(false)
  })
  it.each(['technician', 'dispatcher', 'csr', 'unknown'])('denies pricing changes for %s', async role => {
    vi.mocked(db.organizationMember.findFirst).mockResolvedValue({ ...membership(), role } as never)
    expect((await requireMutationAccess('editPricing')).authorized).toBe(false)
  })
  it.each(['manageCustomers', 'manageInventory', 'manageJobs', 'editPricing'] satisfies Capability[])('does not give technicians %s', capability => {
    expect(canDo('technician', capability)).toBe(false)
  })
  it('permits assigned field work but never broadens a technician to all jobs', async () => {
    vi.mocked(db.organizationMember.findFirst).mockResolvedValue({ ...membership(), role: 'technician' } as never)
    const result = await requireMutationAccess('fieldWork')
    expect(result.authorized).toBe(true)
    if (!result.authorized) throw new Error('Expected access')
    expect(jobAccessWhere(result.context)).toEqual({ organizationId: 'org-real', assignedUserId: 'user-real' })
  })
  it('preserves organization-wide dispatch visibility without removing tenant scope', () => {
    expect(jobAccessWhere({ organizationId: 'org-real', userId: 'owner', role: 'dispatcher' })).toEqual({ organizationId: 'org-real' })
  })
})


describe('customer read boundaries', () => {
  it('restricts field customers to assigned jobs as well as the tenant', () => {
    expect(customerAccessWhere({ organizationId: 'org1', userId: 'tech1', role: 'technician' })).toEqual({
      organizationId: 'org1', deletedAt: null, jobs: { some: { organizationId: 'org1', assignedUserId: 'tech1' } },
    })
  })
  it('retains tenant and soft-delete restrictions for office roles', () => {
    expect(customerAccessWhere({ organizationId: 'org1', userId: 'user1', role: 'office_admin' })).toEqual({ organizationId: 'org1', deletedAt: null })
  })
  it('fails closed for unrecognized roles even if a job was assigned to them', () => {
    expect(jobAccessWhere({ organizationId: 'org1', userId: 'user1', role: 'unknown' })).toEqual({ organizationId: 'org1', id: { in: [] } })
  })
})
