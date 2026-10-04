import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { canDo, type Capability } from '@/lib/permissions'
import { isSubscriptionActive } from '@/lib/billing'

/**
 * Server-owned authorization for operational writes. Billing recovery, sign-in,
 * exports, customer payments and webhook reconciliation intentionally use their
 * own guards so an inactive subscription cannot prevent account recovery or
 * settlement of money already owed.
 */
export async function requireMutationAccess(capability: Capability) {
  const session = await auth()
  if (!session?.user?.id) {
    return { authorized: false, error: 'You must be logged in', status: 401 } as const
  }

  const userId = session.user.id
  const membership = await db.organizationMember.findFirst({
    where: { userId },
    include: { organization: true },
  })
  if (!membership) {
    return { authorized: false, error: 'You must belong to an organization', status: 403 } as const
  }
  if (!canDo(membership.role, capability)) {
    return { authorized: false, error: 'Your role does not have permission to make this change', status: 403 } as const
  }
  const organization = membership.organization
  if (!organization || organization.readOnlyAt || !isSubscriptionActive(organization)) {
    return {
      authorized: false,
      error: 'Your workspace is read-only. Ask the owner to update the subscription in Billing.',
      status: 403,
    } as const
  }
  return {
    authorized: true,
    context: {
      userId,
      userEmail: session.user.email ?? null,
      organizationId: membership.organizationId,
      role: membership.role,
      organization,
      membership,
      session,
    },
  } as const
}

/** Use the same immutable user assignment for field reads and writes. */
export function jobAccessWhere(context: { organizationId: string; userId: string; role: string }) {
  if (!canDo(context.role, 'fieldWork')) return { organizationId: context.organizationId, id: { in: [] as string[] } }
  return {
    organizationId: context.organizationId,
    ...(!canDo(context.role, 'viewAllJobs') ? { assignedUserId: context.userId } : {}),
  }
}

/** Technicians may read customers attached to their assigned work only. */
export function customerAccessWhere(context: { organizationId: string; userId: string; role: string }) {
  return {
    organizationId: context.organizationId,
    deletedAt: null,
    ...(!canDo(context.role, 'viewAllJobs') ? { jobs: { some: jobAccessWhere(context) } } : {}),
  }
}
