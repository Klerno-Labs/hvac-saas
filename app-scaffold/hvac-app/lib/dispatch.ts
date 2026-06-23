import { auth } from '@/lib/auth'
import { db } from '@/lib/db'

/**
 * Roles permitted to mutate the dispatch board (assign/unassign jobs,
 * manage the technician roster). Everyone else (including `member` and
 * `technician`) gets a read-only view.
 *
 * Per the dispatch board spec: editable for Dispatcher / Office-Admin / Owner.
 */
export const DISPATCH_EDIT_ROLES = ['owner', 'dispatcher', 'office_admin'] as const
export type DispatchEditRole = (typeof DISPATCH_EDIT_ROLES)[number]

export function canEditDispatch(role: string | undefined | null): boolean {
  return !!role && (DISPATCH_EDIT_ROLES as readonly string[]).includes(role)
}

type DispatchEditorResult =
  | { authorized: true; context: { userId: string; organizationId: string; role: string } }
  | { authorized: false; error: string }

/**
 * Verify the current user is authenticated AND holds a dispatch-edit role.
 * Used by all dispatch server actions.
 */
export async function requireDispatchEditor(): Promise<DispatchEditorResult> {
  const session = await auth()
  if (!session?.user?.id) {
    return { authorized: false, error: 'You must be logged in' }
  }

  const membership = await db.organizationMember.findFirst({
    where: { userId: session.user.id },
  })
  if (!membership) {
    return { authorized: false, error: 'You must belong to an organization' }
  }

  if (!canEditDispatch(membership.role)) {
    return { authorized: false, error: 'You do not have permission to modify the dispatch board' }
  }

  return {
    authorized: true,
    context: {
      userId: session.user.id,
      organizationId: membership.organizationId,
      role: membership.role,
    },
  }
}

/** Visible board hours (24h), inclusive. 7 AM .. 6 PM. */
export const DISPATCH_HOUR_START = 7
export const DISPATCH_HOUR_END = 18

/** Hour used when assigning via the week view (no specific time-of-day). */
export const DEFAULT_WEEK_ASSIGN_HOUR = 8

/** Active job statuses shown on the board (excludes completed/cancelled). */
export const DISPATCH_ACTIVE_STATUSES = ['draft', 'scheduled', 'in_progress'] as const

function isValidTz(tz: string): boolean {
  try {
    Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

function resolveTz(timezone?: string | null): string {
  return timezone && isValidTz(timezone) ? timezone : 'UTC'
}

/**
 * Wall-clock parts of an ISO instant in the given IANA timezone.
 * Falls back to UTC when the timezone is missing or invalid.
 */
export function wallParts(iso: string, timezone?: string | null) {
  const tz = resolveTz(timezone)
  const d = new Date(iso)
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
  })
  const map: Record<string, string> = {}
  for (const p of fmt.formatToParts(d)) map[p.type] = p.value
  return {
    year: +map.year,
    month: +map.month,
    day: +map.day,
    hour: +map.hour,
    dateKey: `${map.year}-${map.month}-${map.day}`,
  }
}

function wallPartsMs(ms: number, tz: string) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
  const map: Record<string, string> = {}
  for (const p of fmt.formatToParts(new Date(ms))) map[p.type] = p.value
  return {
    year: +map.year,
    month: +map.month,
    day: +map.day,
    hour: +map.hour,
    minute: +map.minute,
  }
}

/**
 * UTC ISO string for a wall-clock time (dateKey @ hour) in the given timezone.
 * Uses a two-pass offset correction to handle DST correctly. With no timezone
 * (or an invalid one) it treats the wall time as UTC for deterministic output.
 */
export function slotIsoForTimezone(dateKey: string, hour: number, timezone?: string | null): string {
  const tz = resolveTz(timezone)
  const [y, m, d] = dateKey.split('-').map(Number)
  if (Number.isNaN(y) || Number.isNaN(m) || Number.isNaN(d)) {
    throw new Error(`Invalid dateKey: ${dateKey}`)
  }
  const guess = Date.UTC(y, m - 1, d, hour)
  if (tz === 'UTC') {
    return new Date(guess).toISOString()
  }
  // Refine: at the candidate instant, read the tz wall-clock, compute the
  // offset, and shift. Two passes absorb DST edge cases.
  let prev = guess
  for (let i = 0; i < 2; i++) {
    const parts = wallPartsMs(prev, tz)
    const wallMs = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute)
    const offsetMin = (wallMs - prev) / 60000
    prev = guess - offsetMin * 60000
  }
  return new Date(prev).toISOString()
}

/**
 * Returns the Monday (ISO dateKey YYYY-MM-DD) of the week containing dateKey.
 * Week starts on Monday. Pure date arithmetic — no timezone involved.
 */
export function mondayOfWeek(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number)
  if (Number.isNaN(y) || Number.isNaN(m) || Number.isNaN(d)) {
    throw new Error(`Invalid dateKey: ${dateKey}`)
  }
  const dt = new Date(Date.UTC(y, m - 1, d))
  const dow = dt.getUTCDay() // 0 = Sunday .. 6 = Saturday
  const daysSinceMonday = (dow + 6) % 7
  dt.setUTCDate(dt.getUTCDate() - daysSinceMonday)
  return dt.toISOString().slice(0, 10)
}

/** Add `days` days to a dateKey, returning a new dateKey. */
export function addDays(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + days)
  return dt.toISOString().slice(0, 10)
}

/** Today's dateKey in the org's timezone. */
export function todayKey(timezone?: string | null): string {
  return wallParts(new Date().toISOString(), timezone).dateKey
}

/** Human-readable lane label, e.g. 7 -> "7 AM", 13 -> "1 PM". */
export function hourLabel(hour: number): string {
  const h = ((hour + 11) % 12) + 1
  return `${h} ${hour < 12 ? 'AM' : 'PM'}`
}
