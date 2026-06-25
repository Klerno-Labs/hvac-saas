import { db } from '@/lib/db'

const SLUG_RE = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/

export function isValidBookingSlug(slug: string): boolean {
  if (slug.length < 2 || slug.length > 50) return false
  return SLUG_RE.test(slug)
}

export async function resolveBookingOrg(slug: string) {
  const org = await db.organization.findUnique({
    where: { bookingSlug: slug },
    select: { id: true, name: true, bookingEnabled: true },
  })
  if (!org || !org.bookingEnabled) return null
  return { id: org.id, name: org.name }
}
