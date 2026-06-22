import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { ROLE_OWNER, normalizeRole, type Role } from '@/lib/permissions'

type AdminContext = {
  userId: string
  userEmail: string | null
  organizationId: string
  role: Role
}

type AdminResult =
  | { authorized: true; context: AdminContext }
  | { authorized: false; error: string }

/**
 * Verify the current user is authenticated AND is the organization owner.
 * Use this for owner-only actions: managing the team, billing/subscription,
 * Stripe Connect, accounting/collections integrations, and the audit log.
 *
 * The role string + capability truth live in `lib/permissions.ts`; this
 * helper resolves the session + membership and checks against ROLE_OWNER.
 */
export async function requireAdmin(): Promise<AdminResult> {
  const session = await auth()
  if (!session?.user?.id) {
    return { authorized: false, error: 'You must be logged in' }
  }

  const userId = session.user.id
  const userEmail = session.user.email ?? null

  const membership = await db.organizationMember.findFirst({
    where: { userId },
  })
  if (!membership) {
    return { authorized: false, error: 'You must belong to an organization' }
  }

  const role = normalizeRole(membership.role)
  if (role !== ROLE_OWNER) {
    return { authorized: false, error: 'Only organization owners can perform this action' }
  }

  return {
    authorized: true,
    context: {
      userId,
      userEmail,
      organizationId: membership.organizationId,
      role,
    },
  }
}
