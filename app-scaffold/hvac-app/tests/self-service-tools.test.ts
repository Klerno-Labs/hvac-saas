import { describe, expect, it } from 'vitest'
import { recommendPlan, estimateAdminTime } from '@/lib/self-service-tools'
import { isFunnelEvent, isPublicFunnelPath, sanitizedPublicEventUrl } from '@/lib/public-funnel'

describe('self-service plan guidance and time calculator', () => {
  it('recommends Pro only for selected team or collection needs', () => {
    expect(recommendPlan(false, false)).toBe('starter')
    for (const [team, collections] of [[true, false], [false, true], [true, true]]) expect(recommendPlan(team, collections)).toBe('pro')
  })
  it('calculates from explicit assumptions and shows a negative result when the target is slower', () => {
    expect(estimateAdminTime(12, 30, 15)).toEqual({ hoursPerMonth: 26, targetHoursPerMonth: 13, changeHoursPerMonth: 13 })
    expect(estimateAdminTime(12, 15, 30)?.changeHoursPerMonth).toBe(-13)
    expect(estimateAdminTime(0, 30, 15)?.changeHoursPerMonth).toBe(0)
  })
  it.each([[NaN, 10, 5], [Infinity, 10, 5], [-1, 10, 5], [1001, 10, 5], [1.5, 10, 5], [1, 241, 5], [1, 5, -1]])('rejects unsupported calculator inputs %s %s %s', (jobs, current, target) => expect(estimateAdminTime(jobs, current, target)).toBeNull())
})
describe('public-only funnel measurement', () => {
  it.each(['/portal/bearer-secret', '/pay/secret', '/settings', '/setup', '/signup', '/help/bearer_123', '/help/article/nested', '/reset-password'])('never collects events on %s', path => {
    expect(isPublicFunnelPath(path)).toBe(false)
    expect(sanitizedPublicEventUrl(`https://fieldclose.app${path}?token=secret`)).toBeNull()
  })
  it('removes all query parameters and fragments even on allowed pages', () => {
    expect(sanitizedPublicEventUrl('https://fieldclose.app/demo?email=private@example.test#private')).toBe('https://fieldclose.app/demo')
    expect(sanitizedPublicEventUrl('invalid')).toBeNull()
    expect(isPublicFunnelPath('/tools/paperwork-calculator')).toBe(true)
    expect(isFunnelEvent('customer_email')).toBe(false)
    expect(isFunnelEvent('demo_completed')).toBe(true)
  })
})
