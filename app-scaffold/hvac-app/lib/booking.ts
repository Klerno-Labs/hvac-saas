import { db } from '@/lib/db'
import { randomBytes } from 'crypto'

export function generateBookingSlug(orgName: string): string {
  const prefix = orgName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 32) || 'org'

  const suffix = randomBytes(4).readUInt32BE(0).toString(36).padStart(7, '0').slice(-6)
  return `${prefix}-${suffix}`
}

export function isValidBookingSlug(slug: string): boolean {
  return /^[a-z0-9]([a-z0-9-]{0,62})[a-z0-9]$/.test(slug)
}

export async function resolveBookingOrg(
  slug: string,
): Promise<{ organizationId: string; organizationName: string } | null> {
  const org = await db.organization.findUnique({
    where: { bookingSlug: slug },
    select: { id: true, name: true, bookingEnabled: true },
  })

  if (!org) return null
  if (!org.bookingEnabled) return null

  return { organizationId: org.id, organizationName: org.name }
}
