import { db } from '@/lib/db'
import {
  DEFAULT_PLAN_LIMITS,
  isOrgActive,
  type EntitlementSnapshot,
  type LimitDecision,
  type LimitKey,
  type PlanId,
  type SubscriptionStatus,
  type WriteDecision,
  type WriteReason,
} from '@/lib/entitlements-claims'

/**
 * Entitlements engine — DB-backed, AUTHORITATIVE entry points used by server
 * actions and route handlers (Node runtime).
 *
 * The pure, edge-safe counterpart (`canWriteFromClaims`) and the canonical
 * active-check (`isOrgActive`) live in `@/lib/entitlements-claims` so they can
 * be bundled into Edge middleware without pulling in Prisma.
 *
 * Fail CLOSED: any lookup error resolves to read-only / over-limit so an unpaid
 * or unknown org can never accidentally write.
 */

export type {
  EntitlementSnapshot,
  LimitDecision,
  LimitKey,
  PlanId,
  SubscriptionStatus,
  WriteDecision,
  WriteReason,
}

export { DEFAULT_PLAN_LIMITS, canWriteFromClaims, isOrgActive }

/**
 * Authoritative write decision from the DB. Fail CLOSED: any error (org missing,
 * DB down) resolves to read-only so an unpaid / unknown org can never write.
 */
export async function canWrite(orgId: string): Promise<WriteDecision> {
  try {
    const org = await db.organization.findUnique({
      where: { id: orgId },
      select: { subscriptionStatus: true, trialEndsAt: true },
    })

    if (!org) {
      return { ok: false, reason: 'inactive_subscription' }
    }

    if (isOrgActive(org)) return { ok: true }

    return {
      ok: false,
      reason:
        org.subscriptionStatus === 'TRIALING'
          ? 'expired_trial'
          : 'inactive_subscription',
    }
  } catch (error) {
    console.error('[entitlements] canWrite lookup failed:', error)
    return { ok: false, reason: 'lookup_failed' }
  }
}

/**
 * Org-scoped current usage for a limit. Every count is scoped by `orgId`.
 */
export async function countForLimit(
  orgId: string,
  limit: LimitKey,
): Promise<number> {
  if (limit === 'maxJobsPerMonth') {
    const startOfMonth = new Date()
    startOfMonth.setDate(1)
    startOfMonth.setHours(0, 0, 0, 0)
    return db.job.count({
      where: { organizationId: orgId, createdAt: { gte: startOfMonth } },
    })
  }

  if (limit === 'maxActiveCustomers') {
    return db.customer.count({
      where: { organizationId: orgId, deletedAt: null },
    })
  }

  if (limit === 'maxUsers') {
    return db.organizationMember.count({ where: { organizationId: orgId } })
  }

  return 0
}

/**
 * Authoritative limit decision. Uses the DB `PlanLimit` row when present,
 * falling back to `DEFAULT_PLAN_LIMITS`. `used >= limit` is over-cap.
 */
export async function checkLimit(
  orgId: string,
  limit: LimitKey,
): Promise<LimitDecision> {
  const org = await db.organization.findUnique({
    where: { id: orgId },
    select: { plan: true },
  })
  const plan: PlanId = (org?.plan as PlanId) ?? 'FREE'

  const row = await db.planLimit.findUnique({ where: { plan } })
  const cap = row?.[limit] ?? DEFAULT_PLAN_LIMITS[plan][limit]

  const used = await countForLimit(orgId, limit)

  return used >= cap
    ? { ok: false, used, limit: cap, plan }
    : { ok: true, used, limit: cap, plan }
}
