import { describe, it, expect, vi, beforeEach } from 'vitest'
import { requirePlan } from '@/lib/billing'
import { redirect } from 'next/navigation'

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}))

describe('Pro Route Protection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('blocks Starter org from Pro route', () => {
    const starterOrg = { subscriptionPlan: 'starter' }
    
    requirePlan(starterOrg, 'pro')
    expect(redirect).toHaveBeenCalledWith('/settings/billing')
  })

  it('allows active Pro org', () => {
    const proOrg = { subscriptionPlan: 'pro' }
    
    requirePlan(proOrg, 'pro')
    expect(redirect).not.toHaveBeenCalled()
  })

  it('blocks expired trial + no subscription', () => {
    const expiredOrg = { 
      subscriptionPlan: 'starter',
      subscriptionStatus: 'trialing',
      trialEndsAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
    }
    
    requirePlan(expiredOrg, 'pro')
    expect(redirect).toHaveBeenCalledWith('/settings/billing')
  })
})