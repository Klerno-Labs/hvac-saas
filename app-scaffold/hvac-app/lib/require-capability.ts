import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import {
  type Capability,
  type Role,
  ROLE_LABELS,
  hasCapability,
  normalizeRole,
} from '@/lib/permissions'

type CapabilityContext = {
  userId: string
  userEmail: string | null
  organizationId: string
  role: Role
}

type CapabilityResult =
  | { authorized: true; context: CapabilityContext }
  | { authorized: false; error: string }

/**
 * Verify the current user is authenticated, belongs to an organization, and
 * holds the given capability for that organization. Use this to gate server
 * actions and route handlers that require a specific permission.
 *
 * The returned context (on success) includes the normalized `role` so callers
 * can apply finer-grained checks — e.g. a technician passes
 * `canEditJobCompletion` but must additionally only act on jobs assigned to
 * them (enforced by scoping the job lookup with `jobScopeWhere`).
 *
 * Capability truth lives in `lib/permissions.ts`; this helper only resolves
 * the session + membership and delegates to `hasCapability`.
 */
export async function requireCapability(
  capability: Capability,
): Promise<CapabilityResult> {
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

  const role = normalizeRole(membership.role)

  if (!hasCapability(role, capability)) {
    return {
      authorized: false,
      error: `Your role (${ROLE_LABELS[role]}) is not permitted to perform this action`,
    }
  }

  return {
    authorized: true,
    context: {
      userId: session.user.id,
      userEmail: session.user.email ?? null,
      organizationId: membership.organizationId,
      role,
    },
  }
}
