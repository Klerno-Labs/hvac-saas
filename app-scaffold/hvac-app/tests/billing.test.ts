import { describe, it, expect, vi } from 'vitest'
import { isSubscriptionActive, hasRequiredPlan, requirePlan } from '@/lib/billing'
import { redirect } from 'next/navigation'

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}))

describe('isSubscriptionActive', () => {
  it('returns true for active subscription', () => {
    expect(isSubscriptionActive({ subscriptionStatus: 'active', trialEndsAt: null })).toBe(true)
  })

  it('returns true for active subscription with trial end date', () => {
    expect(isSubscriptionActive({ subscriptionStatus: 'active', trialEndsAt: new Date() })).toBe(true)
  })

  it('returns false for trialing with no trial end date', () => {
    expect(isSubscriptionActive({ subscriptionStatus: 'trialing', trialEndsAt: null })).toBe(false)
  })

  it('returns true for trialing with future trial end date', () => {
    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    expect(isSubscriptionActive({ subscriptionStatus: 'trialing', trialEndsAt: futureDate })).toBe(true)
  })

  it('returns false for trialing with past trial end date', () => {
    const pastDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    expect(isSubscriptionActive({ subscriptionStatus: 'trialing', trialEndsAt: pastDate })).toBe(false)
  })

  it('returns false for expired trial with no subscription', () => {
    const pastDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    expect(isSubscriptionActive({ subscriptionStatus: 'trialing', trialEndsAt: pastDate })).toBe(false)
  })

  it('returns false for inactive status', () => {
    expect(isSubscriptionActive({ subscriptionStatus: 'canceled', trialEndsAt: null })).toBe(false)
  })

  it('returns false for past_due status', () => {
    expect(isSubscriptionActive({ subscriptionStatus: 'past_due', trialEndsAt: null })).toBe(false)
  })
})

describe('hasRequiredPlan', () => {
  it('returns true when org plan equals required plan', () => {
    expect(hasRequiredPlan({ subscriptionPlan: 'pro' }, 'pro')).toBe(true)
    expect(hasRequiredPlan({ subscriptionPlan: 'starter' }, 'starter')).toBe(true)
  })

  it('returns true when required plan is starter (any plan qualifies)', () => {
    expect(hasRequiredPlan({ subscriptionPlan: 'starter' }, 'starter')).toBe(true)
    expect(hasRequiredPlan({ subscriptionPlan: 'pro' }, 'starter')).toBe(true)
  })

  it('returns false when org is starter and required is pro', () => {
    expect(hasRequiredPlan({ subscriptionPlan: 'starter' }, 'pro')).toBe(false)
  })

  it('returns true when org is pro and required is pro', () => {
    expect(hasRequiredPlan({ subscriptionPlan: 'pro' }, 'pro')).toBe(true)
  })
})

describe('requirePlan', () => {
  it('does nothing when org has required plan', () => {
    expect(() => requirePlan({ subscriptionPlan: 'pro' }, 'pro')).not.toThrow()
  })

  it('redirects when org is starter and required is pro', () => {
    requirePlan({ subscriptionPlan: 'starter' }, 'pro')
    expect(redirect).toHaveBeenCalledWith('/settings/billing')
  })

  it('does nothing when required is starter (any plan qualifies)', () => {
    expect(() => requirePlan({ subscriptionPlan: 'starter' }, 'starter')).not.toThrow()
    expect(() => requirePlan({ subscriptionPlan: 'pro' }, 'starter')).not.toThrow()
  })
})