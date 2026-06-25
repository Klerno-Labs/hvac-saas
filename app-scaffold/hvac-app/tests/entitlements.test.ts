import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the Prisma client with plain vi.fn()s; each test configures return values.
vi.mock('@/lib/db', () => ({
  db: {
    organization: { findUnique: vi.fn() },
    planLimit: { findUnique: vi.fn() },
    organizationMember: { count: vi.fn() },
    job: { count: vi.fn() },
    customer: { count: vi.fn() },
  },
}))

import { db } from '@/lib/db'
import { getEntitlements, getUsage, assertWithinPlanLimit } from '@/lib/entitlements'

const PRO = { maxUsers: 50, maxJobsPerMonth: 1000, maxActiveCustomers: 500 }
const STARTER = { maxUsers: 5, maxJobsPerMonth: 100, maxActiveCustomers: 50 }
const FREE = { maxUsers: 1, maxJobsPerMonth: 10, maxActiveCustomers: 5 }
const ALL_LIMITS = { PRO, STARTER, FREE }

beforeEach(() => {
  vi.clearAllMocks()
})

function mockOrg(org: Record<string, unknown> | null) {
  vi.mocked(db.organization.findUnique).mockResolvedValue(org as never)
}

function mockLimits(plan: string) {
  const row = (ALL_LIMITS as Record<string, typeof PRO>)[plan] ?? null
  vi.mocked(db.planLimit.findUnique).mockResolvedValue(row as never)
}

function mockCounts(users: number, jobs: number, customers: number) {
  vi.mocked(db.organizationMember.count).mockResolvedValue(users)
  vi.mocked(db.job.count).mockResolvedValue(jobs)
  vi.mocked(db.customer.count).mockResolvedValue(customers)
}

describe('getEntitlements', () => {
  it('reports active PRO plan as writable with resolved limits', async () => {
    mockOrg({ plan: 'PRO', subscriptionStatus: 'ACTIVE', trialEndsAt: null, stripeCustomerId: 'cus_1' })
    mockLimits('PRO')

    const e = await getEntitlements('org_1')

    expect(e.plan).toBe('PRO')
    expect(e.status).toBe('ACTIVE')
    expect(e.isReadOnly).toBe(false)
    expect(e.readOnlyReason).toBeNull()
    expect(e.trialExpired).toBe(false)
    expect(e.hasStripeCustomer).toBe(true)
    expect(e.limits).toEqual(PRO)
    expect(db.organization.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'org_1' } }),
    )
  })

  it('flags an expired trial as read-only with trial_expired reason', async () => {
    const past = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    mockOrg({ plan: 'STARTER', subscriptionStatus: 'TRIALING', trialEndsAt: past, stripeCustomerId: null })
    vi.mocked(db.planLimit.findUnique).mockResolvedValue(null) // missing row → fallback

    const e = await getEntitlements('org_1')

    expect(e.isReadOnly).toBe(true)
    expect(e.trialExpired).toBe(true)
    expect(e.readOnlyReason).toBe('trial_expired')
    expect(e.trialDaysRemaining).toBe(0)
    // Falls back to safe defaults when PlanLimit row is missing.
    expect(e.limits).toEqual(FREE)
  })

  it('reports a canceled subscription as read-only with the right reason', async () => {
    mockOrg({ plan: 'STARTER', subscriptionStatus: 'CANCELED', trialEndsAt: null, stripeCustomerId: 'cus_1' })
    mockLimits('STARTER')

    const e = await getEntitlements('org_1')
    expect(e.isReadOnly).toBe(true)
    expect(e.readOnlyReason).toBe('subscription_canceled')
  })
})

describe('getUsage', () => {
  it('returns org-scoped counts for each limit', async () => {
    mockOrg({ plan: 'STARTER', subscriptionStatus: 'ACTIVE', trialEndsAt: null, stripeCustomerId: null })
    mockLimits('STARTER')
    mockCounts(3, 42, 12)

    const usage = await getUsage('org_42')

    expect(usage).toEqual([
      { limitKey: 'maxUsers', label: 'Team members', used: 3, cap: 5 },
      { limitKey: 'maxJobsPerMonth', label: 'Jobs this month', used: 42, cap: 100 },
      { limitKey: 'maxActiveCustomers', label: 'Active customers', used: 12, cap: 50 },
    ])
    // Every count is scoped by organizationId.
    expect(db.organizationMember.count).toHaveBeenCalledWith(expect.objectContaining({ where: { organizationId: 'org_42' } }))
    expect(db.job.count).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ organizationId: 'org_42' }) }))
    expect(db.customer.count).toHaveBeenCalledWith(expect.objectContaining({ where: { organizationId: 'org_42', deletedAt: null } }))
  })
})

describe('assertWithinPlanLimit', () => {
  it('blocks with plan_limit when used >= cap', async () => {
    mockOrg({ plan: 'STARTER', subscriptionStatus: 'ACTIVE', trialEndsAt: null, stripeCustomerId: null })
    mockLimits('STARTER')
    mockCounts(5, 0, 0)

    expect(await assertWithinPlanLimit('org_1', 'maxUsers')).toEqual({ ok: false, error: 'plan_limit' })
  })

  it('allows when used < cap', async () => {
    mockOrg({ plan: 'STARTER', subscriptionStatus: 'ACTIVE', trialEndsAt: null, stripeCustomerId: null })
    mockLimits('STARTER')
    mockCounts(4, 0, 0)

    expect(await assertWithinPlanLimit('org_1', 'maxUsers')).toEqual({ ok: true })
  })
})
