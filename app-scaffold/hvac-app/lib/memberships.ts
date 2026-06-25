import { db } from '@/lib/db'

export async function updateMembershipStatus(
  membershipId: string,
  organizationId: string,
  status: 'active' | 'paused' | 'cancelled',
) {
  const membership = await db.membership.findFirst({ where: { id: membershipId, organizationId } })
  if (!membership) return null
  return db.membership.update({ where: { id: membershipId }, data: { status } })
}
