import { describe, it, expect } from 'vitest'
import {
  createMembershipPlanSchema,
  createMembershipEnrollmentSchema,
} from '@/lib/validations/membership'

describe('createMembershipPlanSchema', () => {
  const valid = {
    name: 'Comfort Club',
    termMonths: 12,
    visitFrequency: 'biannual' as const,
    includedVisitsPerTerm: 2,
    priceCents: 29900,
  }

  it('accepts valid plan data', () => {
    const result = createMembershipPlanSchema.safeParse(valid)
    expect(result.success).toBe(true)
  })

  it('requires a name', () => {
    const result = createMembershipPlanSchema.safeParse({ ...valid, name: '' })
    expect(result.success).toBe(false)
  })

  it('requires termMonths >= 1', () => {
    expect(createMembershipPlanSchema.safeParse({ ...valid, termMonths: 0 }).success).toBe(false)
  })

  it('caps termMonths at 60', () => {
    expect(createMembershipPlanSchema.safeParse({ ...valid, termMonths: 61 }).success).toBe(false)
  })

  it('rejects an invalid visitFrequency', () => {
    expect(
      createMembershipPlanSchema.safeParse({ ...valid, visitFrequency: 'weekly' }).success,
    ).toBe(false)
  })

  it('requires includedVisitsPerTerm >= 1', () => {
    expect(
      createMembershipPlanSchema.safeParse({ ...valid, includedVisitsPerTerm: 0 }).success,
    ).toBe(false)
  })

  it('rejects negative price', () => {
    expect(createMembershipPlanSchema.safeParse({ ...valid, priceCents: -1 }).success).toBe(false)
  })

  it('rejects non-integer price', () => {
    expect(createMembershipPlanSchema.safeParse({ ...valid, priceCents: 12.99 }).success).toBe(false)
  })

  it('treats description as optional and trims empty to undefined', () => {
    const result = createMembershipPlanSchema.safeParse({ ...valid, description: '' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.description).toBeUndefined()
    }
  })
})

describe('createMembershipEnrollmentSchema', () => {
  const valid = {
    customerId: 'cust_1',
    planId: 'plan_1',
    effectiveDate: '2026-01-15',
  }

  it('accepts valid enrollment with no equipment', () => {
    const result = createMembershipEnrollmentSchema.safeParse(valid)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.equipmentIds).toEqual([])
    }
  })

  it('defaults equipmentIds to empty array when omitted', () => {
    const result = createMembershipEnrollmentSchema.safeParse(valid)
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.equipmentIds).toEqual([])
  })

  it('accepts a list of equipment ids', () => {
    const result = createMembershipEnrollmentSchema.safeParse({
      ...valid,
      equipmentIds: ['eq_1', 'eq_2'],
    })
    expect(result.success).toBe(true)
  })

  it('rejects empty-string equipment ids', () => {
    const result = createMembershipEnrollmentSchema.safeParse({
      ...valid,
      equipmentIds: ['eq_1', ''],
    })
    expect(result.success).toBe(false)
  })

  it('requires customerId', () => {
    expect(
      createMembershipEnrollmentSchema.safeParse({ ...valid, customerId: '' }).success,
    ).toBe(false)
  })

  it('requires planId', () => {
    expect(createMembershipEnrollmentSchema.safeParse({ ...valid, planId: '' }).success).toBe(false)
  })

  it('requires effectiveDate', () => {
    expect(
      createMembershipEnrollmentSchema.safeParse({ ...valid, effectiveDate: '' }).success,
    ).toBe(false)
  })
})
