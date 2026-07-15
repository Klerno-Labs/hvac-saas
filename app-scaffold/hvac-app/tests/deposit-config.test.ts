import { describe, it, expect } from 'vitest'
import { depositConfigSchema } from '@/lib/validations/deposit'

describe('depositConfigSchema', () => {
  it('passes when depositRequired is false with no type or value', () => {
    expect(depositConfigSchema.safeParse({ depositRequired: false }).success).toBe(true)
  })

  it('passes for percent type with positive depositPercent', () => {
    const result = depositConfigSchema.safeParse({
      depositRequired: true,
      depositType: 'percent',
      depositPercent: 25,
    })
    expect(result.success).toBe(true)
  })

  it('passes for fixed type with positive depositFixedCents', () => {
    const result = depositConfigSchema.safeParse({
      depositRequired: true,
      depositType: 'fixed',
      depositFixedCents: 10000,
    })
    expect(result.success).toBe(true)
  })

  it('fails when depositRequired=true but no type provided', () => {
    const result = depositConfigSchema.safeParse({ depositRequired: true })
    expect(result.success).toBe(false)
  })

  it('fails when type=percent but depositPercent is missing', () => {
    const result = depositConfigSchema.safeParse({
      depositRequired: true,
      depositType: 'percent',
    })
    expect(result.success).toBe(false)
  })

  it('fails when type=percent but depositPercent is 0', () => {
    const result = depositConfigSchema.safeParse({
      depositRequired: true,
      depositType: 'percent',
      depositPercent: 0,
    })
    expect(result.success).toBe(false)
  })

  it('fails when type=fixed but depositFixedCents is missing', () => {
    const result = depositConfigSchema.safeParse({
      depositRequired: true,
      depositType: 'fixed',
    })
    expect(result.success).toBe(false)
  })

  it('fails when type=fixed but depositFixedCents is 0', () => {
    const result = depositConfigSchema.safeParse({
      depositRequired: true,
      depositType: 'fixed',
      depositFixedCents: 0,
    })
    expect(result.success).toBe(false)
  })
})
