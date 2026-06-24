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
    const starterOrg = { plan: 'STARTER' as const }
    
    requirePlan(starterOrg, 'pro')
    expect(redirect).toHaveBeenCalledWith('/settings/billing')
  })

  it('allows active Pro org', () => {
    const proOrg = { plan: 'PRO' as const }
    
    requirePlan(proOrg, 'pro')
    expect(redirect).not.toHaveBeenCalled()
  })

  it('blocks expired trial + no subscription', () => {
    const expiredOrg = { 
      plan: 'STARTER' as const,
    }
    
    requirePlan(expiredOrg, 'pro')
    expect(redirect).toHaveBeenCalledWith('/settings/billing')
  })
})