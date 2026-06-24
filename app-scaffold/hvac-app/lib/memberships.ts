import type { MembershipVisitFrequency } from '@/lib/validations/membership'

/**
 * Memberships / service-agreement scheduling engine.
 *
 * All functions here are PURE (take a `now` parameter, no DB, no I/O) so the
 * cadence math is exhaustively unit-testable and can never drift from a
 * denormalized counter. The only persistent source of truth for a term is
 * `MembershipEnrollment.effectiveDate` + `MembershipPlan.termMonths`.
 *
 * Visit scheduling itself is delegated to the existing RecurringJob machinery:
 * enrolling creates an active RecurringJob whose `frequency` equals the plan's
 * `visitFrequency`, and the existing /api/recurring/generate cron turns due
 * dates into Jobs. Nothing here mutates the database.
 */

/** Months added per visit-cadence tick. Mirrors RecurringJob frequencies. */
export const CADENCE_MONTHS: Record<MembershipVisitFrequency, number> = {
  monthly: 1,
  quarterly: 3,
  biannual: 6,
  annual: 12,
}

/**
 * Add (or subtract) whole months to a date using calendar arithmetic.
 * Matches the behavior of /api/recurring/generate's calculateNextDueDate
 * (local-time setMonth) so derived schedules stay consistent with generated
 * Jobs. JS overflows month-end days (e.g. Jan 31 + 1mo => Mar 3); this is the
 * same behavior the existing cron relies on, so we keep it for consistency.
 */
export function addMonths(date: Date, months: number): Date {
  const next = new Date(date)
  next.setMonth(next.getMonth() + months)
  return next
}

export type TermWindow = {
  /** Inclusive start of the current term. */
  termStart: Date
  /** Exclusive end of the current term (= start of the next term). */
  termEnd: Date
  /** How many complete terms have elapsed since effectiveDate. */
  termsElapsed: number
}

/**
 * Compute the current membership term window given the enrollment's effective
 * date, the plan term length, and "now". A term is `[start, end)` where
 * `end = start + termMonths`. Rolls forward in whole terms.
 */
export function computeCurrentTerm(
  effectiveDate: Date,
  termMonths: number,
  now: Date = new Date(),
): TermWindow {
  if (termMonths < 1) {
    throw new Error('termMonths must be >= 1')
  }
  if (now < effectiveDate) {
    // Enrollment not yet in effect — the first term is the upcoming window.
    return { termStart: new Date(effectiveDate), termEnd: addMonths(effectiveDate, termMonths), termsElapsed: 0 }
  }
  const monthsSinceStart = monthDiff(effectiveDate, now)
  const termsElapsed = Math.floor(monthsSinceStart / termMonths)
  const termStart = addMonths(effectiveDate, termsElapsed * termMonths)
  const termEnd = addMonths(termStart, termMonths)
  return { termStart, termEnd, termsElapsed }
}

/** Whole calendar months from `from` to `to` (to >= from). */
function monthDiff(from: Date, to: Date): number {
  const years = to.getFullYear() - from.getFullYear()
  const months = to.getMonth() - from.getMonth()
  return years * 12 + months
}

export type Utilization = {
  termStart: Date
  termEnd: Date
  termsElapsed: number
  visitsIncluded: number
  /** Visit slots whose scheduled date has passed in the current term, capped at included. */
  visitsElapsed: number
  visitsRemaining: number
  /** Next upcoming visit date within the term, or null if the term is spent. */
  nextVisitDate: Date | null
}

export type UtilizationInput = {
  effectiveDate: Date
  termMonths: number
  visitFrequency: MembershipVisitFrequency
  includedVisitsPerTerm: number
}

/**
 * Derive visit utilization for a membership term purely from cadence + dates.
 *
 * Visit slot `k` (0-indexed) within a term is scheduled at
 * `termStart + k*cadenceMonths`. A slot has "elapsed" once its date <= now.
 * `visitsElapsed` is capped at `includedVisitsPerTerm` so a plan never reports
 * more elapsed visits than it budgets — extra cadence ticks beyond the budget
 * are treated as overage (out of scope to bill; flagged in known-issues).
 *
 * NOTE: visitsElapsed is the count of *scheduled* slots that have come due,
 * which corresponds 1:1 with Jobs the recurring cron will generate. It is NOT
 * a count of *completed* jobs — exact completion attribution requires linking
 * Jobs to memberships and is deferred (see docs/known-issues.md).
 */
export function computeMembershipUtilization(
  input: UtilizationInput,
  now: Date = new Date(),
): Utilization {
  const { effectiveDate, termMonths, visitFrequency, includedVisitsPerTerm } = input
  const cadence = CADENCE_MONTHS[visitFrequency]
  const { termStart, termEnd, termsElapsed } = computeCurrentTerm(effectiveDate, termMonths, now)

  const visitsIncluded = Math.max(0, includedVisitsPerTerm)

  let visitsElapsed = 0
  let nextVisitDate: Date | null = null

  for (let k = 0; k < visitsIncluded; k++) {
    const slotDate = addMonths(termStart, k * cadence)
    if (slotDate >= termEnd) break
    if (slotDate <= now) {
      visitsElapsed++
    } else if (nextVisitDate === null) {
      nextVisitDate = slotDate
    }
  }

  return {
    termStart,
    termEnd,
    termsElapsed,
    visitsIncluded,
    visitsElapsed,
    visitsRemaining: Math.max(0, visitsIncluded - visitsElapsed),
    nextVisitDate,
  }
}

/** Human-friendly label for a RecurringJob/membership cadence. */
export function frequencyLabel(frequency: string): string {
  switch (frequency) {
    case 'monthly':
      return 'Monthly'
    case 'quarterly':
      return 'Quarterly'
    case 'biannual':
      return 'Biannual'
    case 'annual':
      return 'Annual'
    default:
      return frequency
  }
}

/** Title used for the RecurringJob created by an enrollment. */
export function membershipScheduleTitle(planName: string, customerLabel: string): string {
  return `${planName} – ${customerLabel}`
}

/** First visit date for a freshly-enrolled membership (the first due date). */
export function firstVisitDate(effectiveDate: Date): Date {
  return new Date(effectiveDate)
}
