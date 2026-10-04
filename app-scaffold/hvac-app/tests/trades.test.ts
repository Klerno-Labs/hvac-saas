import { describe, expect, it } from 'vitest'
import { getTradeProfile, isTradeId, TRADE_IDS, TRADE_PROFILES } from '@/lib/trades'
import { createOrganizationSchema } from '@/lib/validations/onboarding'
import { updateTradeSchema } from '@/lib/validations/trade'

describe('trade profiles and onboarding', () => {
  it.each(TRADE_IDS)('supports %s consistently in onboarding and settings', (tradeType) => {
    expect(isTradeId(tradeType)).toBe(true)
    expect(getTradeProfile(tradeType)).toBe(TRADE_PROFILES[tradeType])
    expect(createOrganizationSchema.parse({ name: 'Service Co', tradeType }).tradeType).toBe(tradeType)
    expect(updateTradeSchema.parse({ tradeType }).tradeType).toBe(tradeType)
  })

  it('keeps HVAC as the existing onboarding default', () => {
    expect(createOrganizationSchema.parse({ name: 'Existing Shop' }).tradeType).toBe('hvac')
    expect(getTradeProfile(null).id).toBe('hvac')
  })

  it('uses neutral vocabulary for an unknown legacy trade without silently changing its data', () => {
    expect(getTradeProfile('landscaping').id).toBe('general-service')
    expect(isTradeId('landscaping')).toBe(false)
    expect(updateTradeSchema.safeParse({ tradeType: 'landscaping' }).success).toBe(false)
  })

  it.each(['toString', '__proto__', 'HVAC', '', null, 1])('rejects unsupported input %s', (tradeType) => {
    expect(isTradeId(tradeType)).toBe(false)
    expect(updateTradeSchema.safeParse({ tradeType }).success).toBe(false)
  })
})
