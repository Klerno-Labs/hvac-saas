import { describe, it, expect } from 'vitest'
import { createMembershipPlanSchema, enrollMembershipSchema } from '@/lib/validations/membership'

describe('createMembershipPlanSchema', () => {
  it('accepts a valid plan', () => {
    const result = createMembershipPlanSchema.safeParse({
      name: 'Annual Tune-Up Plan',
      cadence: 'annual',
      visitsPerYear: 2,
      priceCents: 29900,
    })
    expect(result.success).toBe(true)
  })

  it('rejects empty name', () => {
    const result = createMembershipPlanSchema.safeParse({
      name: '',
      cadence: 'annual',
      visitsPerYear: 2,
      priceCents: 29900,
    })
    expect(result.success).toBe(false)
  })

  it('rejects cadence not in enum', () => {
    const result = createMembershipPlanSchema.safeParse({
      name: 'Plan',
      cadence: 'weekly',
      visitsPerYear: 2,
      priceCents: 0,
    })
    expect(result.success).toBe(false)
  })

  it('coerces string visitsPerYear and rejects below min 1', () => {
    const coerced = createMembershipPlanSchema.safeParse({
      name: 'Plan',
      cadence: 'monthly',
      visitsPerYear: '1',
      priceCents: 0,
    })
    expect(coerced.success).toBe(true)

    const tooLow = createMembershipPlanSchema.safeParse({
      name: 'Plan',
      cadence: 'monthly',
      visitsPerYear: 0,
      priceCents: 0,
    })
    expect(tooLow.success).toBe(false)
  })
})

describe('enrollMembershipSchema', () => {
  it('requires planId, customerId, and startDate', () => {
    const missing = enrollMembershipSchema.safeParse({})
    expect(missing.success).toBe(false)

    const valid = enrollMembershipSchema.safeParse({
      planId: 'plan-1',
      customerId: 'cust-1',
      startDate: '2026-01-01',
    })
    expect(valid.success).toBe(true)
  })

  it('defaults equipmentIds to empty array when omitted', () => {
    const result = enrollMembershipSchema.safeParse({
      planId: 'plan-1',
      customerId: 'cust-1',
      startDate: '2026-01-01',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.equipmentIds).toEqual([])
    }
  })
})
