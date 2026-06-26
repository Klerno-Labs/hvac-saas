/**
 * Pure period-resolution helper — no DB, no I/O, easy to unit-test.
 *
 * Accepted period strings: 'month' | 'quarter' | 'ytd' | 'last30'.
 * Any unrecognized value silently defaults to 'month'.
 */

export function resolvePeriod(
  period: string,
  now: Date,
  timezone?: string,
): { start: Date; end: Date } {
  const tz = timezone ?? 'UTC'
  const end = now

  if (period === 'last30') {
    return { start: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000), end }
  }

  const localDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now) // "YYYY-MM-DD" guaranteed by en-CA locale

  const year = parseInt(localDate.slice(0, 4))
  const month = parseInt(localDate.slice(5, 7))

  if (period === 'ytd') {
    return { start: calendarMidnightUtc(year, 1, 1, tz), end }
  }

  if (period === 'quarter') {
    const qStartMonth = Math.floor((month - 1) / 3) * 3 + 1
    return { start: calendarMidnightUtc(year, qStartMonth, 1, tz), end }
  }

  // 'month' and any unrecognized value
  return { start: calendarMidnightUtc(year, month, 1, tz), end }
}

/**
 * Returns the UTC Date for 00:00:00 on (year, month, day) in the given IANA timezone.
 * Uses noon as the reference point to avoid DST-transition edge cases at midnight.
 */
function calendarMidnightUtc(year: number, month: number, day: number, tz: string): Date {
  const approxNoon = new Date(Date.UTC(year, month - 1, day, 12))
  const offset = tzOffsetMs(approxNoon, tz)
  // local = UTC + offset  →  midnight_local_as_UTC = Date.UTC(y,m,d,0) - offset
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0) - offset)
}

/** Returns (local clock - UTC clock) in ms at the given instant for the given IANA timezone. */
function tzOffsetMs(date: Date, tz: string): number {
  const utc = dtfComponents(date, 'UTC')
  const loc = dtfComponents(date, tz)
  return (
    Date.UTC(loc.year, loc.month - 1, loc.day, loc.hour, loc.minute, loc.second) -
    Date.UTC(utc.year, utc.month - 1, utc.day, utc.hour, utc.minute, utc.second)
  )
}

function dtfComponents(date: Date, tz: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false,
  }).formatToParts(date)
  const get = (type: string) => parseInt(parts.find((p) => p.type === type)!.value)
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour') % 24, // some engines return 24 for midnight with hour12:false
    minute: get('minute'),
    second: get('second'),
  }
}
