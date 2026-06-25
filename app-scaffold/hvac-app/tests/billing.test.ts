import { describe, it, expect, vi, beforeEach } from 'vitest'
import { isSubscriptionActive, hasRequiredPlan, requirePlan } from '@/lib/billing'
import { redirect } from 'next/navigation'

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}))

describe('isSubscriptionActive', () => {
  it('returns true for active subscription', () => {
    expect(isSubscriptionActive({ subscriptionStatus: 'ACTIVE', trialEndsAt: null })).toBe(true)
  })

  it('returns true for active subscription with trial end date', () => {
    expect(isSubscriptionActive({ subscriptionStatus: 'ACTIVE', trialEndsAt: new Date() })).toBe(true)
  })

  it('returns false for trialing with no trial end date', () => {
    expect(isSubscriptionActive({ subscriptionStatus: 'TRIALING', trialEndsAt: null })).toBe(false)
  })

  it('returns true for trialing with future trial end date', () => {
    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    expect(isSubscriptionActive({ subscriptionStatus: 'TRIALING', trialEndsAt: futureDate })).toBe(true)
  })

  it('returns false for trialing with past trial end date', () => {
    const pastDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    expect(isSubscriptionActive({ subscriptionStatus: 'TRIALING', trialEndsAt: pastDate })).toBe(false)
  })

  it('returns false for expired trial with no subscription', () => {
    const pastDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    expect(isSubscriptionActive({ subscriptionStatus: 'TRIALING', trialEndsAt: pastDate })).toBe(false)
  })

  it('returns false for inactive status', () => {
    expect(isSubscriptionActive({ subscriptionStatus: 'CANCELED', trialEndsAt: null })).toBe(false)
  })

  it('returns false for past_due status', () => {
    expect(isSubscriptionActive({ subscriptionStatus: 'PAST_DUE', trialEndsAt: null })).toBe(false)
  })
})

describe('hasRequiredPlan', () => {
  it('returns true when org plan equals required plan', () => {
    expect(hasRequiredPlan({ plan: 'PRO' }, 'pro')).toBe(true)
    expect(hasRequiredPlan({ plan: 'STARTER' }, 'starter')).toBe(true)
  })

  it('returns true when required plan is starter (any plan qualifies)', () => {
    expect(hasRequiredPlan({ plan: 'STARTER' }, 'starter')).toBe(true)
    expect(hasRequiredPlan({ plan: 'PRO' }, 'starter')).toBe(true)
  })

  it('returns false when org is starter and required is pro', () => {
    expect(hasRequiredPlan({ plan: 'STARTER' }, 'pro')).toBe(false)
  })

  it('returns true when org is pro and required is pro', () => {
    expect(hasRequiredPlan({ plan: 'PRO' }, 'pro')).toBe(true)
  })

  it('returns false when org is FREE and required is pro (no FREE escalation)', () => {
    expect(hasRequiredPlan({ plan: 'FREE' }, 'pro')).toBe(false)
  })

  it('returns false when org is FREE and required is starter', () => {
    expect(hasRequiredPlan({ plan: 'FREE' }, 'starter')).toBe(false)
  })
})

describe('requirePlan', () => {
  it('does nothing when org has required plan', () => {
    expect(() => requirePlan({ plan: 'PRO' }, 'pro')).not.toThrow()
  })

  it('redirects when org is starter and required is pro', () => {
    requirePlan({ plan: 'STARTER' }, 'pro')
    expect(redirect).toHaveBeenCalledWith('/settings/billing')
  })

  it('does nothing when required is starter (any plan qualifies)', () => {
    expect(() => requirePlan({ plan: 'STARTER' }, 'starter')).not.toThrow()
    expect(() => requirePlan({ plan: 'PRO' }, 'starter')).not.toThrow()
  })
})

describe('Pro feature gating scenarios', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('(a) Starter org is blocked from a Pro-only route', () => {
    const starterOrg = { plan: 'STARTER' as const }

    expect(hasRequiredPlan(starterOrg, 'pro')).toBe(false)

    requirePlan(starterOrg, 'pro')
    expect(redirect).toHaveBeenCalledWith('/settings/billing')
  })

  it('(b) expired trial with no subscription is blocked (not treated as an unlimited active trial)', () => {
    const expiredTrial = {
      subscriptionStatus: 'TRIALING' as const,
      trialEndsAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    }
    expect(isSubscriptionActive(expiredTrial)).toBe(false)

    const nullTrial = {
      subscriptionStatus: 'TRIALING' as const,
      trialEndsAt: null,
    }
    expect(isSubscriptionActive(nullTrial)).toBe(false)
  })

  it('(c) active Pro org is allowed through Pro-only routes', () => {
    const proOrg = { plan: 'PRO' as const }

    expect(hasRequiredPlan(proOrg, 'pro')).toBe(true)

    requirePlan(proOrg, 'pro')
    expect(redirect).not.toHaveBeenCalled()

    expect(isSubscriptionActive({ subscriptionStatus: 'ACTIVE', trialEndsAt: null })).toBe(true)
  })
})