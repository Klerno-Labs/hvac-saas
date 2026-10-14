export function formatCents(cents: number): string {
  return '$' + (cents / 100).toFixed(2)
}

/** Schedules and invoice due dates are calendar dates encoded in UTC, not appointment instants. */
export function formatDateOnly(value: Date | string): string {
  return new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(value))
}

/** Invalid or missing stored time zones use UTC deterministically. */
export function resolveBusinessTimeZone(timezone?: string | null): string {
  if (!timezone) return 'UTC'
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: timezone }).resolvedOptions().timeZone
  } catch {
    return 'UTC'
  }
}

/**
 * Today's business calendar date encoded at UTC midnight, matching date-only
 * columns. This is not the physical instant at which local midnight occurred.
 */
export function startOfBusinessDayAsUtcDate(now = new Date(), timezone?: string | null): Date {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: resolveBusinessTimeZone(timezone), year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now)
  const value = (type: string) => Number(parts.find(part => part.type === type)?.value)
  return new Date(Date.UTC(value('year'), value('month') - 1, value('day')))
}

/** An invoice becomes overdue after the business's due calendar day ends. */
export function isDueDatePast(value: Date | string, now = new Date(), timezone?: string | null): boolean {
  return new Date(value).getTime() < startOfBusinessDayAsUtcDate(now, timezone).getTime()
}
