import { describe, it, expect } from 'vitest'
import { canDo, VALID_ROLES } from '@/lib/permissions'

describe('canDo', () => {
  it('owner has all capabilities', () => {
    expect(canDo('owner', 'editPricing')).toBe(true)
    expect(canDo('owner', 'manageBilling')).toBe(true)
    expect(canDo('owner', 'manageTeam')).toBe(true)
    expect(canDo('owner', 'viewAllJobs')).toBe(true)
    expect(canDo('owner', 'manageJobs')).toBe(true)
  })

  it('office_admin can edit pricing and manage jobs but not billing or team', () => {
    expect(canDo('office_admin', 'editPricing')).toBe(true)
    expect(canDo('office_admin', 'manageJobs')).toBe(true)
    expect(canDo('office_admin', 'manageBilling')).toBe(false)
    expect(canDo('office_admin', 'manageTeam')).toBe(false)
  })

  it('dispatcher can manage jobs but not edit pricing or billing', () => {
    expect(canDo('dispatcher', 'viewAllJobs')).toBe(true)
    expect(canDo('dispatcher', 'manageJobs')).toBe(true)
    expect(canDo('dispatcher', 'editPricing')).toBe(false)
    expect(canDo('dispatcher', 'manageBilling')).toBe(false)
    expect(canDo('dispatcher', 'manageTeam')).toBe(false)
  })

  it('technician has no capabilities (data-filtered to assigned jobs)', () => {
    expect(canDo('technician', 'editPricing')).toBe(false)
    expect(canDo('technician', 'viewAllJobs')).toBe(false)
    expect(canDo('technician', 'manageJobs')).toBe(false)
    expect(canDo('technician', 'manageBilling')).toBe(false)
    expect(canDo('technician', 'manageTeam')).toBe(false)
  })

  it('csr can view and manage jobs but not edit pricing or billing', () => {
    expect(canDo('csr', 'viewAllJobs')).toBe(true)
    expect(canDo('csr', 'manageJobs')).toBe(true)
    expect(canDo('csr', 'editPricing')).toBe(false)
    expect(canDo('csr', 'manageBilling')).toBe(false)
    expect(canDo('csr', 'manageTeam')).toBe(false)
  })

  it('legacy member role has backward-compat access matching office_admin', () => {
    expect(canDo('member', 'editPricing')).toBe(true)
    expect(canDo('member', 'viewAllJobs')).toBe(true)
    expect(canDo('member', 'manageJobs')).toBe(true)
    expect(canDo('member', 'manageBilling')).toBe(false)
    expect(canDo('member', 'manageTeam')).toBe(false)
  })

  it('unknown role has no capabilities', () => {
    expect(canDo('unknown_role', 'editPricing')).toBe(false)
    expect(canDo('unknown_role', 'viewAllJobs')).toBe(false)
  })

  it('VALID_ROLES contains exactly the five active roles', () => {
    expect(VALID_ROLES).toContain('owner')
    expect(VALID_ROLES).toContain('office_admin')
    expect(VALID_ROLES).toContain('dispatcher')
    expect(VALID_ROLES).toContain('technician')
    expect(VALID_ROLES).toContain('csr')
    expect(VALID_ROLES).not.toContain('member')
  })
})
