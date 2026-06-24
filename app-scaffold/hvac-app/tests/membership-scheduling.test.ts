import { describe, it, expect } from 'vitest'
import {
  addMonths,
  computeCurrentTerm,
  computeMembershipUtilization,
  CADENCE_MONTHS,
  membershipScheduleTitle,
  firstVisitDate,
} from '@/lib/memberships'

// Use a fixed "now" helper to keep cadence math deterministic.
const at = (iso: string) => new Date(iso)

describe('addMonths', () => {
  it('adds whole months', () => {
    expect(addMonths(at('2026-01-15T00:00:00'), 1).getMonth()).toBe(1) // Feb
    expect(addMonths(at('2026-01-15T00:00:00'), 12).getFullYear()).toBe(2027)
  })

  it('does not mutate the input date', () => {
    const d = at('2026-01-15T00:00:00')
    addMonths(d, 3)
    expect(d.getMonth()).toBe(0) // still January
  })

  it('supports subtraction', () => {
    // 2026-03-15 minus 3 months => 2025-12-15 (December, month index 11)
    expect(addMonths(at('2026-03-15T00:00:00'), -3).getMonth()).toBe(11)
  })

  it('overflows month-end consistently (Jan 31 + 1mo => Mar 3, JS semantics)', () => {
    const r = addMonths(at('2026-01-31T00:00:00'), 1)
    expect(r.getMonth()).toBe(2) // March
    expect(r.getDate()).toBe(3)
  })
})

describe('CADENCE_MONTHS', () => {
  it('maps each cadence to expected months', () => {
    expect(CADENCE_MONTHS).toEqual({
      monthly: 1,
      quarterly: 3,
      biannual: 6,
      annual: 12,
    })
  })
})

describe('computeCurrentTerm', () => {
  it('returns the first term before the effective date', () => {
    const effective = at('2026-06-01T00:00:00')
    const t = computeCurrentTerm(effective, 12, at('2026-05-01T00:00:00'))
    expect(t.termsElapsed).toBe(0)
    expect(t.termStart.getTime()).toBe(effective.getTime())
    expect(t.termEnd).toEqual(addMonths(effective, 12))
  })

  it('returns term 0 within the first year', () => {
    const effective = at('2026-01-01T00:00:00')
    const t = computeCurrentTerm(effective, 12, at('2026-06-01T00:00:00'))
    expect(t.termsElapsed).toBe(0)
    expect(t.termStart).toEqual(effective)
    expect(t.termEnd).toEqual(at('2027-01-01T00:00:00'))
  })

  it('rolls into term 1 after 12 months', () => {
    const effective = at('2026-01-01T00:00:00')
    const t = computeCurrentTerm(effective, 12, at('2027-01-01T00:00:00'))
    expect(t.termsElapsed).toBe(1)
    expect(t.termStart).toEqual(at('2027-01-01T00:00:00'))
    expect(t.termEnd).toEqual(at('2028-01-01T00:00:00'))
  })

  it('rolls term by completed months even for non-annual terms', () => {
    const effective = at('2026-01-01T00:00:00')
    // 6-month terms, 7 months in => term 1
    const t = computeCurrentTerm(effective, 6, at('2026-08-01T00:00:00'))
    expect(t.termsElapsed).toBe(1)
    expect(t.termStart).toEqual(at('2026-07-01T00:00:00'))
    expect(t.termEnd).toEqual(at('2027-01-01T00:00:00'))
  })

  it('throws on invalid termMonths', () => {
    expect(() => computeCurrentTerm(at('2026-01-01T00:00:00'), 0, at('2026-06-01T00:00:00'))).toThrow()
  })
})

describe('computeMembershipUtilization', () => {
  const base = {
    effectiveDate: at('2026-01-01T00:00:00'),
    termMonths: 12,
    visitFrequency: 'biannual' as const,
    includedVisitsPerTerm: 2,
  }

  it('marks the first visit elapsed exactly at effective date', () => {
    const u = computeMembershipUtilization(base, at('2026-01-01T00:00:00'))
    expect(u.visitsIncluded).toBe(2)
    expect(u.visitsElapsed).toBe(1) // slot 0 at termStart is due immediately
    expect(u.visitsRemaining).toBe(1)
    expect(u.nextVisitDate).toEqual(at('2026-07-01T00:00:00'))
    expect(u.termsElapsed).toBe(0)
  })

  it('keeps one visit remaining mid-term between the two slots', () => {
    const u = computeMembershipUtilization(base, at('2026-04-01T00:00:00'))
    expect(u.visitsElapsed).toBe(1)
    expect(u.visitsRemaining).toBe(1)
    expect(u.nextVisitDate).toEqual(at('2026-07-01T00:00:00'))
  })

  it('marks both visits elapsed once the second slot passes', () => {
    const u = computeMembershipUtilization(base, at('2026-07-02T00:00:00'))
    expect(u.visitsElapsed).toBe(2)
    expect(u.visitsRemaining).toBe(0)
    expect(u.nextVisitDate).toBeNull()
  })

  it('resets utilization at the start of a new term', () => {
    // 13 months in -> term 1 starts 2027-01-01, slot0 due immediately
    const u = computeMembershipUtilization(base, at('2027-01-02T00:00:00'))
    expect(u.termsElapsed).toBe(1)
    expect(u.termStart).toEqual(at('2027-01-01T00:00:00'))
    expect(u.visitsElapsed).toBe(1)
    expect(u.visitsRemaining).toBe(1)
    expect(u.nextVisitDate).toEqual(at('2027-07-01T00:00:00'))
  })

  it('caps elapsed at included even when cadence would schedule more', () => {
    // monthly cadence (12 slots/yr) but only 2 budgeted visits per term
    const u = computeMembershipUtilization(
      { ...base, visitFrequency: 'monthly' as const, includedVisitsPerTerm: 2 },
      at('2026-09-01T00:00:00'),
    )
    expect(u.visitsIncluded).toBe(2)
    expect(u.visitsElapsed).toBe(2) // capped, not 9
    expect(u.visitsRemaining).toBe(0)
  })

  it('nextVisitDate is the soonest upcoming slot after now', () => {
    // 2 slots: 2026-01-01 and 2026-07-01. At 2026-03-01, next is the July slot.
    const u = computeMembershipUtilization(base, at('2026-03-01T00:00:00'))
    expect(u.nextVisitDate).toEqual(at('2026-07-01T00:00:00'))
  })

  it('handles a single annual visit plan', () => {
    const u = computeMembershipUtilization(
      { ...base, visitFrequency: 'annual' as const, includedVisitsPerTerm: 1 },
      at('2026-06-01T00:00:00'),
    )
    expect(u.visitsElapsed).toBe(1)
    expect(u.visitsRemaining).toBe(0)
    expect(u.nextVisitDate).toBeNull()
  })

  it('treats zero-included plan gracefully', () => {
    const u = computeMembershipUtilization(
      { ...base, includedVisitsPerTerm: 0 },
      at('2026-06-01T00:00:00'),
    )
    expect(u.visitsIncluded).toBe(0)
    expect(u.visitsElapsed).toBe(0)
    expect(u.visitsRemaining).toBe(0)
    expect(u.nextVisitDate).toBeNull()
  })
})

describe('helpers', () => {
  it('membershipScheduleTitle joins plan and customer', () => {
    expect(membershipScheduleTitle('Comfort Club', 'Acme Plumbing')).toBe(
      'Comfort Club – Acme Plumbing',
    )
  })

  it('firstVisitDate returns a fresh copy of the effective date', () => {
    const eff = at('2026-02-10T00:00:00')
    const v = firstVisitDate(eff)
    expect(v.getTime()).toBe(eff.getTime())
    v.setMonth(5)
    expect(eff.getMonth()).toBe(1) // original untouched
  })
})
