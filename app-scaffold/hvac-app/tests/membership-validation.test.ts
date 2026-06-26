import { describe, it, expect } from 'vitest'
import { createMembershipPlanSchema, enrollMembershipSchema } from '@/lib/validations/membership'

describe('createMembershipPlanSchema', () => {
  it('accepts a valid plan', () => {
    const result = createMembershipPlanSchema.safeParse({
      name: 'Annual HVAC Care',
      cadence: 'annual',
      visitsPerYear: 2,
      priceCents: 29900,
    })
    expect(result.success).toBe(true)
  })

  it('rejects empty name', () => {
    const result = createMembershipPlanSchema.safeParse({
      name: '',
      cadence: 'monthly',
      visitsPerYear: 12,
      priceCents: 0,
    })
    expect(result.success).toBe(false)
  })

  it('rejects cadence not in the enum', () => {
    const result = createMembershipPlanSchema.safeParse({
      name: 'Plan',
      cadence: 'weekly',
      visitsPerYear: 52,
      priceCents: 0,
    })
    expect(result.success).toBe(false)
  })

  it('coerces visitsPerYear from string', () => {
    const result = createMembershipPlanSchema.safeParse({
      name: 'Plan',
      cadence: 'annual',
      visitsPerYear: '2',
      priceCents: 0,
    })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.visitsPerYear).toBe(2)
  })

  it('rejects visitsPerYear below min 1', () => {
    const result = createMembershipPlanSchema.safeParse({
      name: 'Plan',
      cadence: 'annual',
      visitsPerYear: 0,
      priceCents: 0,
    })
    expect(result.success).toBe(false)
  })
})

describe('enrollMembershipSchema', () => {
  it('accepts valid enrollment data', () => {
    const result = enrollMembershipSchema.safeParse({
      planId: 'plan-1',
      customerId: 'cust-1',
      startDate: '2026-01-01',
    })
    expect(result.success).toBe(true)
  })

  it('requires planId', () => {
    const result = enrollMembershipSchema.safeParse({
      planId: '',
      customerId: 'cust-1',
      startDate: '2026-01-01',
    })
    expect(result.success).toBe(false)
  })

  it('requires customerId', () => {
    const result = enrollMembershipSchema.safeParse({
      planId: 'plan-1',
      customerId: '',
      startDate: '2026-01-01',
    })
    expect(result.success).toBe(false)
  })

  it('requires startDate', () => {
    const result = enrollMembershipSchema.safeParse({
      planId: 'plan-1',
      customerId: 'cust-1',
      startDate: '',
    })
    expect(result.success).toBe(false)
  })

  it('defaults equipmentIds to empty array', () => {
    const result = enrollMembershipSchema.safeParse({
      planId: 'plan-1',
      customerId: 'cust-1',
      startDate: '2026-01-01',
    })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.equipmentIds).toEqual([])
  })
})
