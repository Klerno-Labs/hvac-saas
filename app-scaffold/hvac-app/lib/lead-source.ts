/**
 * Lead-source attribution + booking-slug helpers.
 *
 * `LEAD_SOURCES` is the canonical, fixed bucket set used for reporting
 * consistency across customers and jobs. The string is stored as a free column
 * (nullable) but UI selects should source from this list. `'web_booking'` is
 * stamped automatically by the public booking widget — never entered manually.
 */

export const LEAD_SOURCES = [
  'web_booking',
  'web',
  'referral',
  'phone',
  'walk_in',
  'repeat',
  'other',
] as const
export type LeadSource = (typeof LEAD_SOURCES)[number]

export const LEAD_SOURCE_LABELS: Record<LeadSource, string> = {
  web_booking: 'Online booking',
  web: 'Website',
  referral: 'Referral',
  phone: 'Phone',
  walk_in: 'Walk-in',
  repeat: 'Repeat customer',
  other: 'Other',
}

/** Sources selectable on the manual new-customer / new-job forms. */
export const MANUAL_LEAD_SOURCES: LeadSource[] = LEAD_SOURCES.filter(
  (s) => s !== 'web_booking',
)

export function isLeadSource(value: unknown): value is LeadSource {
  return typeof value === 'string' && (LEAD_SOURCES as readonly string[]).includes(value)
}

export function leadSourceLabel(value: string | null | undefined): string {
  if (!value) return '—'
  return isLeadSource(value) ? LEAD_SOURCE_LABELS[value] : value
}

/* -------------------------------------------------------------------------- */
/* Service types offered on the public booking widget                         */
/* -------------------------------------------------------------------------- */

export const SERVICE_TYPES = [
  'repair',
  'install',
  'tune_up',
  'inspection',
  'emergency',
  'other',
] as const
export type ServiceType = (typeof SERVICE_TYPES)[number]

export const SERVICE_TYPE_LABELS: Record<ServiceType, string> = {
  repair: 'Repair',
  install: 'Installation / replacement',
  tune_up: 'Tune-up / maintenance',
  inspection: 'Inspection',
  emergency: 'Emergency (no heat / no AC)',
  other: 'Other',
}

export const TIME_WINDOWS = ['anytime', 'morning', 'afternoon', 'evening'] as const
export type TimeWindow = (typeof TIME_WINDOWS)[number]

export const TIME_WINDOW_LABELS: Record<TimeWindow, string> = {
  anytime: 'Any time',
  morning: 'Morning',
  afternoon: 'Afternoon',
  evening: 'Evening',
}

/* -------------------------------------------------------------------------- */
/* Public booking slug normalization                                          */
/* -------------------------------------------------------------------------- */

const SLUG_MIN = 3
const SLUG_MAX = 40

/**
 * Normalize a free-form name into a URL-safe booking slug.
 * Lowercases, collapses non-alphanumerics to single hyphens, trims edges.
 * Returns empty string if nothing usable remains.
 */
export function normalizeSlug(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX)
}

/** A slug is valid if it's 3-40 chars of [a-z0-9-], not starting/ending with -. */
export function isValidSlug(slug: string): boolean {
  if (slug.length < SLUG_MIN || slug.length > SLUG_MAX) return false
  return /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(slug)
}

/**
 * Build the absolute public booking URL for an organization slug.
 * Uses APP_URL (falling back to localhost) — consistent with portal URL building.
 */
export function buildPublicBookingUrl(slug: string): string {
  const appUrl = process.env.APP_URL || 'http://localhost:3000'
  return `${appUrl}/book/${slug}`
}
