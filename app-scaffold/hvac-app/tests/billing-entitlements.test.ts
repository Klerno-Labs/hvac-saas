import { describe, it, expect } from 'vitest'
import { deriveEntitlements } from '@/lib/entitlements'

const BASE_ORG = {
  plan: 'STARTER' as const,
  subscriptionStatus: 'ACTIVE' as const,
  trialEndsAt: null,
  readOnlyAt: null,
}

describe('deriveEntitlements — plan and status', () => {
  it('returns the correct plan and status from the org record', () => {
    const ent = deriveEntitlements({ ...BASE_ORG, plan: 'PRO', subscriptionStatus: 'ACTIVE' }, 2)
    expect(ent.plan).toBe('PRO')
    expect(ent.status).toBe('ACTIVE')
    expect(ent.isActive).toBe(true)
  })

  it('returns isActive=false for CANCELED', () => {
    const ent = deriveEntitlements({ ...BASE_ORG, subscriptionStatus: 'CANCELED' }, 0)
    expect(ent.isActive).toBe(false)
  })

  it('returns isActive=false for PAST_DUE', () => {
    const ent = deriveEntitlements({ ...BASE_ORG, subscriptionStatus: 'PAST_DUE' }, 0)
    expect(ent.isActive).toBe(false)
  })
})

describe('deriveEntitlements — trial state', () => {
  it('returns trialDaysLeft > 0 for a future trial end date', () => {
    const trialEndsAt = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000)
    const ent = deriveEntitlements({ ...BASE_ORG, subscriptionStatus: 'TRIALING', trialEndsAt }, 0)
    expect(ent.trialDaysLeft).toBeGreaterThan(0)
  })

  it('returns trialDaysLeft=0 when trial end date is in the past (trial expired)', () => {
    const trialEndsAt = new Date(Date.now() - 1000)
    const ent = deriveEntitlements({ ...BASE_ORG, subscriptionStatus: 'TRIALING', trialEndsAt }, 0)
    expect(ent.trialDaysLeft).toBe(0)
  })

  it('returns trialDaysLeft=null when not trialing', () => {
    const ent = deriveEntitlements({ ...BASE_ORG, subscriptionStatus: 'ACTIVE' }, 0)
    expect(ent.trialDaysLeft).toBeNull()
  })

  it('returns trialDaysLeft=null when trialing with no trialEndsAt (free beta)', () => {
    const ent = deriveEntitlements({ ...BASE_ORG, subscriptionStatus: 'TRIALING', trialEndsAt: null }, 0)
    expect(ent.trialDaysLeft).toBeNull()
  })
})

describe('deriveEntitlements — usage limits', () => {
  it('sets STARTER seat cap to 1', () => {
    const ent = deriveEntitlements({ ...BASE_ORG, plan: 'STARTER' }, 0)
    expect(ent.limits.teamSeats.cap).toBe(1)
  })

  it('sets PRO seat cap to null (unlimited)', () => {
    const ent = deriveEntitlements({ ...BASE_ORG, plan: 'PRO' }, 5)
    expect(ent.limits.teamSeats.cap).toBeNull()
  })

  it('reflects the live seat count in used', () => {
    const ent = deriveEntitlements({ ...BASE_ORG, plan: 'STARTER' }, 1)
    expect(ent.limits.teamSeats.used).toBe(1)
  })

  it('at-risk is true when used >= cap (STARTER with 1 seat used)', () => {
    const ent = deriveEntitlements({ ...BASE_ORG, plan: 'STARTER' }, 1)
    const { cap, used } = ent.limits.teamSeats
    expect(cap !== null && used >= cap).toBe(true)
  })

  it('at-risk is false when used < cap', () => {
    const ent = deriveEntitlements({ ...BASE_ORG, plan: 'PRO' }, 99)
    const { cap, used } = ent.limits.teamSeats
    expect(cap !== null && used >= cap).toBe(false)
  })
})

describe('deriveEntitlements — read-only status', () => {
  it('isReadOnly=false for an active org', () => {
    const ent = deriveEntitlements({ ...BASE_ORG, subscriptionStatus: 'ACTIVE' }, 0)
    expect(ent.isReadOnly).toBe(false)
    expect(ent.readOnlyReason).toBeNull()
  })

  it('isReadOnly=true for PAST_DUE with a reason', () => {
    const ent = deriveEntitlements({ ...BASE_ORG, subscriptionStatus: 'PAST_DUE' }, 0)
    expect(ent.isReadOnly).toBe(true)
    expect(ent.readOnlyReason).toBeTruthy()
  })

  it('isReadOnly=true for CANCELED with a reason', () => {
    const ent = deriveEntitlements({ ...BASE_ORG, subscriptionStatus: 'CANCELED' }, 0)
    expect(ent.isReadOnly).toBe(true)
    expect(ent.readOnlyReason).toBeTruthy()
  })

  it('isReadOnly=true when readOnlyAt is set, even if subscription is active', () => {
    const ent = deriveEntitlements(
      { ...BASE_ORG, subscriptionStatus: 'ACTIVE', readOnlyAt: new Date() },
      0
    )
    expect(ent.isReadOnly).toBe(true)
    expect(ent.readOnlyReason).toBe('Your account has been frozen')
  })

  it('isReadOnly=false for a trialing org with future trial end', () => {
    const trialEndsAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
    const ent = deriveEntitlements({ ...BASE_ORG, subscriptionStatus: 'TRIALING', trialEndsAt }, 0)
    expect(ent.isReadOnly).toBe(false)
  })
})
