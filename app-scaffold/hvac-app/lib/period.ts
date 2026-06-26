/**
 * Computes a concrete { start, end } date range for a named period.
 * Unknown period values default to "month" rather than throwing.
 * When a timezone is provided, calendar boundaries (month/quarter/ytd start)
 * are anchored to midnight in that timezone.
 */
export function resolvePeriod(
  period: string,
  now: Date,
  timezone?: string,
): { start: Date; end: Date } {
  const tz = timezone ?? 'UTC'

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(now)

  const year = Number(parts.find((p) => p.type === 'year')!.value)
  const month = Number(parts.find((p) => p.type === 'month')!.value) // 1-indexed

  let start: Date
  switch (period) {
    case 'last30':
      start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
      break
    case 'ytd':
      start = tzMidnight(year, 1, 1, tz)
      break
    case 'quarter':
      start = tzMidnight(year, Math.floor((month - 1) / 3) * 3 + 1, 1, tz)
      break
    case 'month':
    default:
      start = tzMidnight(year, month, 1, tz)
  }

  return { start, end: now }
}

/**
 * Returns the UTC Date corresponding to midnight on year/month/day in the
 * given IANA timezone.
 *
 * Approach: format noon UTC on the target day in the target timezone to
 * learn how many seconds have elapsed since that timezone's midnight,
 * then subtract that from noon UTC. Works correctly for all timezones
 * where the offset keeps noon UTC within the same local calendar day
 * (UTC-11 to UTC+11.5 — covers all US/Canada zones).
 */
function tzMidnight(year: number, month: number, day: number, tz: string): Date {
  const ref = new Date(Date.UTC(year, month - 1, day, 12, 0, 0))
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(ref)
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value)
  const elapsedSecs = get('hour') * 3600 + get('minute') * 60 + get('second')
  return new Date(ref.getTime() - elapsedSecs * 1000)
}
