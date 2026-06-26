import { db } from '@/lib/db'

export function isValidBookingSlug(slug: string): boolean {
  return /^[a-z0-9-]{3,80}$/.test(slug)
}

export function generateBookingSlug(orgName: string): string {
  const base = orgName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
    .replace(/-+$/, '')
  const suffix = Math.random().toString(36).slice(2, 7)
  return base ? `${base}-${suffix}` : suffix
}

export async function resolveBookingOrg(slug: string): Promise<{ id: string } | null> {
  return db.organization.findFirst({
    where: { bookingSlug: slug, bookingEnabled: true },
    select: { id: true },
  })
}

export function buildJobNotes(preferredWindow: string, requestNotes?: string | null): string {
  const parts = [`Preferred window: ${preferredWindow}`]
  if (requestNotes) parts.push(requestNotes)
  return parts.join('\n\n')
}
