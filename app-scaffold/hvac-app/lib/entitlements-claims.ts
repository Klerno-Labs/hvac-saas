/**
 * Pure, dependency-free entitlement primitives.
 *
 * This module MUST stay free of Prisma / Stripe / billing imports so it can be
 * bundled into the Edge runtime middleware without pulling in a database
 * client. It is the single source of truth for the "is this org allowed to
 * write?" decision over a compact snapshot of org state.
 *
 * The DB-backed engine (`lib/entitlements.ts`) and the legacy billing helper
 * (`lib/billing.ts` -> `isSubscriptionActive`) both delegate here so there is
 * exactly one active-check implementation.
 */

export type PlanId = 'FREE' | 'STARTER' | 'PRO'

export type SubscriptionStatus =
  | 'TRIALING'
  | 'ACTIVE'
  | 'PAST_DUE'
  | 'CANCELED'
  | 'UNPAID'
  | 'INCOMPLETE'

export type LimitKey = 'maxUsers' | 'maxJobsPerMonth' | 'maxActiveCustomers'

/**
 * Compact, JSON-safe snapshot of the org's entitlement-relevant state.
 * Embedded in the JWT so middleware can make an edge-safe write decision.
 */
export type EntitlementSnapshot = {
  organizationId: string
  plan: PlanId
  subscriptionStatus: SubscriptionStatus
  trialEndsAt: string | null
}

export type WriteReason =
  | 'expired_trial'
  | 'inactive_subscription'
  | 'lookup_failed'

export type WriteDecision =
  | { ok: true }
  | { ok: false; reason: WriteReason }

export type LimitDecision =
  | { ok: true; used: number; limit: number; plan: PlanId }
  | { ok: false; used: number; limit: number; plan: PlanId }

/**
 * Built-in fallback limits, mirroring `prisma/seed.ts`. Used when no
 * `PlanLimit` row exists for a plan (e.g. seed not yet run) so the app does not
 * hard-lock every org. The DB row always wins when present.
 */
export const DEFAULT_PLAN_LIMITS: Record<PlanId, Record<LimitKey, number>> = {
  FREE: { maxUsers: 1, maxJobsPerMonth: 10, maxActiveCustomers: 5 },
  STARTER: { maxUsers: 5, maxJobsPerMonth: 100, maxActiveCustomers: 50 },
  PRO: { maxUsers: 50, maxJobsPerMonth: 1000, maxActiveCustomers: 500 },
}

/**
 * Canonical "is the org active (may write)" check.
 *
 * ACTIVE -> allowed. TRIALING -> allowed only while `trialEndsAt` is in the
 * future. Everything else (PAST_DUE, CANCELED, UNPAID, INCOMPLETE, or a trialing
 * org whose trial has elapsed) -> not allowed.
 */
export function isOrgActive(org: {
  subscriptionStatus: SubscriptionStatus
  trialEndsAt: Date | string | null
}): boolean {
  if (org.subscriptionStatus === 'ACTIVE') return true

  if (org.subscriptionStatus === 'TRIALING') {
    if (!org.trialEndsAt) return false
    return new Date(org.trialEndsAt) > new Date()
  }

  return false
}

/**
 * Pure write decision from a JWT/claims snapshot. Edge-safe (no DB).
 *
 * Returns `{ ok: true }` when the snapshot is absent — middleware cannot make
 * a decision without claims, so it defers to the authoritative server-action
 * guard (which re-queries the DB). This keeps stale JWTs (pre-dating the
 * entitlement snapshot) or unauthenticated requests from being mis-blocked at
 * the edge; the route handler's own auth + the action guard still enforce.
 */
export function canWriteFromClaims(
  snapshot: EntitlementSnapshot | null | undefined,
): WriteDecision {
  if (!snapshot || !snapshot.organizationId) return { ok: true }

  if (
    isOrgActive({
      subscriptionStatus: snapshot.subscriptionStatus,
      trialEndsAt: snapshot.trialEndsAt,
    })
  ) {
    return { ok: true }
  }

  return {
    ok: false,
    reason:
      snapshot.subscriptionStatus === 'TRIALING'
        ? 'expired_trial'
        : 'inactive_subscription',
  }
}
