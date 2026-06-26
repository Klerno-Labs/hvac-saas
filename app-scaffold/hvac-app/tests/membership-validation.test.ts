import { describe, it, expect } from 'vitest'
import { createMembershipPlanSchema, enrollMembershipSchema } from '@/lib/validations/membership'

// UI helper functions mirroring the page implementations
function cadenceLabel(cadence: string): string {
  switch (cadence) {
    case 'monthly': return 'Monthly'
    case 'quarterly': return 'Quarterly'
    case 'biannual': return 'Biannual'
    case 'annual': return 'Annual'
    default: return cadence
  }
}

function visitsLabel(used: number, included: number): string {
  return `${used} / ${included} visits used`
}

function planPriceLabel(cents: number): string {
  return '$' + (cents / 100).toFixed(2)
}

describe('createMembershipPlanSchema', () => {
  const valid = {
    name: 'HVAC Comfort Plan',
    cadence: 'annual',
    visitsPerYear: '2',
    price: '199.00',
  }

  it('accepts valid plan', () => {
    expect(createMembershipPlanSchema.safeParse(valid).success).toBe(true)
  })

  it('requires name', () => {
    expect(createMembershipPlanSchema.safeParse({ ...valid, name: '' }).success).toBe(false)
  })

  it('rejects invalid cadence', () => {
    expect(createMembershipPlanSchema.safeParse({ ...valid, cadence: 'weekly' }).success).toBe(false)
  })

  it('rejects zero visits', () => {
    expect(createMembershipPlanSchema.safeParse({ ...valid, visitsPerYear: '0' }).success).toBe(false)
  })

  it('rejects negative price', () => {
    expect(createMembershipPlanSchema.safeParse({ ...valid, price: '-1' }).success).toBe(false)
  })

  it('coerces string price to number', () => {
    const result = createMembershipPlanSchema.safeParse({ ...valid, price: '199.99' })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.price).toBe(199.99)
  })

  it('allows zero price', () => {
    expect(createMembershipPlanSchema.safeParse({ ...valid, price: '0' }).success).toBe(true)
  })

  it('accepts all valid cadences', () => {
    for (const cadence of ['monthly', 'quarterly', 'biannual', 'annual']) {
      expect(createMembershipPlanSchema.safeParse({ ...valid, cadence }).success).toBe(true)
    }
  })
})

describe('enrollMembershipSchema', () => {
  const valid = {
    planId: 'plan-1',
    customerId: 'cust-1',
    startDate: '2026-01-01',
    equipmentIds: ['eq-1', 'eq-2'],
  }

  it('accepts valid enrollment', () => {
    expect(enrollMembershipSchema.safeParse(valid).success).toBe(true)
  })

  it('requires planId', () => {
    expect(enrollMembershipSchema.safeParse({ ...valid, planId: '' }).success).toBe(false)
  })

  it('requires customerId', () => {
    expect(enrollMembershipSchema.safeParse({ ...valid, customerId: '' }).success).toBe(false)
  })

  it('defaults equipmentIds to empty array when omitted', () => {
    const result = enrollMembershipSchema.safeParse({ ...valid, equipmentIds: undefined })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.equipmentIds).toEqual([])
  })

  it('accepts empty equipmentIds', () => {
    const result = enrollMembershipSchema.safeParse({ ...valid, equipmentIds: [] })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.equipmentIds).toEqual([])
  })
})

describe('visitsLabel', () => {
  it('formats visits used / included', () => {
    expect(visitsLabel(1, 4)).toBe('1 / 4 visits used')
    expect(visitsLabel(0, 2)).toBe('0 / 2 visits used')
    expect(visitsLabel(4, 4)).toBe('4 / 4 visits used')
  })
})

describe('planPriceLabel', () => {
  it('formats cents as USD dollars', () => {
    expect(planPriceLabel(19900)).toBe('$199.00')
    expect(planPriceLabel(150)).toBe('$1.50')
    expect(planPriceLabel(0)).toBe('$0.00')
  })

  it('rounds to two decimal places', () => {
    expect(planPriceLabel(1)).toBe('$0.01')
    expect(planPriceLabel(999)).toBe('$9.99')
  })
})

describe('cadenceLabel', () => {
  it('formats all known cadences', () => {
    expect(cadenceLabel('monthly')).toBe('Monthly')
    expect(cadenceLabel('quarterly')).toBe('Quarterly')
    expect(cadenceLabel('biannual')).toBe('Biannual')
    expect(cadenceLabel('annual')).toBe('Annual')
  })

  it('passes through unknown cadence unchanged', () => {
    expect(cadenceLabel('weekly')).toBe('weekly')
  })
})
