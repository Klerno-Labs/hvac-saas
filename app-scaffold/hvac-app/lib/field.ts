import { FIELD_STATUSES, type FieldStatus } from '@/lib/validations/field'

type AddressLike = {
  addressLine1?: string | null
  addressLine2?: string | null
  city?: string | null
  state?: string | null
  postalCode?: string | null
}

/**
 * Format a customer's address into a single comma-joined string.
 * Returns '' when no address parts are present.
 */
export function formatCustomerAddress(c: AddressLike): string {
  const line1 = (c.addressLine1 ?? '').trim()
  const line2 = (c.addressLine2 ?? '').trim()
  const city = (c.city ?? '').trim()
  const state = (c.state ?? '').trim()
  const postal = (c.postalCode ?? '').trim()
  const region = [state, postal].filter(Boolean).join(' ')
  return [line1, line2, city, region].filter(Boolean).join(', ')
}

/**
 * Build a Google Maps turn-by-turn navigation URL for an address.
 * Returns null when the address is empty so callers can hide the link.
 */
export function buildMapsUrl(address: string): string | null {
  const q = address.trim()
  if (!q) return null
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(q)}`
}

/**
 * Returns the UTC instants bracketing "today" (00:00:00.000 → 23:59:59.999)
 * in the given IANA timezone. Falls back to UTC when no timezone is provided.
 *
 * `now` is parameterised for deterministic testing.
 */
export function getTodayBounds(
  timezone?: string | null,
  now: Date = new Date(),
): { start: Date; end: Date } {
  const tz = timezone && timezone.trim() ? timezone.trim() : null

  let y: number
  let mo: number
  let d: number
  if (tz) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now)
    const get = (t: string) => Number(parts.find((p) => p.type === t)!.value)
    y = get('year')
    mo = get('month')
    d = get('day')
  } else {
    y = now.getUTCFullYear()
    mo = now.getUTCMonth() + 1
    d = now.getUTCDate()
  }

  // Initial estimate: midnight wall-clock interpreted as UTC, then shifted by
  // the tz offset at that instant. A second iteration corrects for DST jumps
  // near the midnight boundary.
  const t0 = Date.UTC(y, mo - 1, d, 0, 0, 0)
  let off = tz ? tzOffsetMinutes(tz, new Date(t0)) : 0
  let start = new Date(t0 - off * 60_000)
  if (tz) {
    off = tzOffsetMinutes(tz, start)
    start = new Date(t0 - off * 60_000)
  }
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1)
  return { start, end }
}

/**
 * Offset (in minutes) of `timezone` from UTC at the given instant.
 * Positive = ahead of UTC, negative = behind. Uses Intl formatToParts so it
 * never depends on the host server's local timezone.
 */
function tzOffsetMinutes(timezone: string, instant: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant)
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value)
  let h = get('hour')
  if (h === 24) h = 0
  const wallAsUtcMs = Date.UTC(get('year'), get('month') - 1, get('day'), h, get('minute'), get('second'))
  return (wallAsUtcMs - instant.getTime()) / 60_000
}

/**
 * Bridge the technician's mobile `fieldStatus` to the back-office `Job.status`
 * lifecycle. "done" completes the job; en_route/on_site mark it in_progress
 * (without regressing already-completed/cancelled jobs).
 */
export function resolveJobStatusForField(
  fieldStatus: FieldStatus,
  currentStatus: string,
): string {
  if (fieldStatus === 'done') return 'completed'
  if (fieldStatus === 'en_route' || fieldStatus === 'on_site') {
    if (currentStatus === 'draft' || currentStatus === 'scheduled') return 'in_progress'
  }
  return currentStatus
}

export function isFieldStatus(value: string): value is FieldStatus {
  return (FIELD_STATUSES as readonly string[]).includes(value)
}

export function fieldStatusLabel(status: string): string {
  switch (status) {
    case 'en_route':
      return 'En route'
    case 'on_site':
      return 'On site'
    case 'done':
      return 'Completed'
    case 'pending':
    default:
      return 'Not started'
  }
}

export function fieldStatusVariant(status: string): 'default' | 'secondary' | 'outline' {
  switch (status) {
    case 'done':
      return 'default'
    case 'en_route':
    case 'on_site':
      return 'outline'
    case 'pending':
    default:
      return 'secondary'
  }
}
