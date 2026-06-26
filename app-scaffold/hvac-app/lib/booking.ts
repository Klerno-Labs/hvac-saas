import { db } from '@/lib/db'

export function isValidBookingSlug(slug: string): boolean {
  return typeof slug === 'string' && /^[a-z0-9][a-z0-9-]{1,78}[a-z0-9]$/.test(slug)
}

export function generateBookingSlug(orgName: string): string {
  const base =
    orgName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 44) || 'booking'
  const suffix = Math.random().toString(36).slice(2, 8)
  return `${base}-${suffix}`
}

export async function resolveBookingOrg(slug: string) {
  return db.organization.findFirst({
    where: { bookingSlug: slug, bookingEnabled: true },
  })
}
