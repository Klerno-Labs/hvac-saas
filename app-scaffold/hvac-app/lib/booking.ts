import { db } from '@/lib/db'

// Slugs must be 2-50 lowercase alphanumeric + hyphen chars, starting with a letter or digit.
const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,49}$/

export function isValidBookingSlug(slug: string): boolean {
  return SLUG_RE.test(slug)
}

export async function resolveBookingOrg(slug: string) {
  return db.organization.findFirst({
    where: { bookingSlug: slug, bookingEnabled: true },
    select: { id: true, name: true },
  })
}
