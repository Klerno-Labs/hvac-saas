import { db } from '@/lib/db'
import { isSubscriptionActive } from '@/lib/billing'
import { getTrialDaysRemaining } from '@/lib/subscription'

/**
 * Entitlements engine (server-only).
 *
 * Single source of truth for "what this organization can do right now", built on
 * the existing `PlanLimit` table and `isSubscriptionActive`. All data is derived
 * server-side from the org id; only the narrow DTOs below ever cross into the
 * client. No Stripe keys, customer ids, or raw Prisma rows leave this module.
 */

export type LimitKey = 'maxUsers' | 'maxJobsPerMonth' | 'maxActiveCustomers'

export type PlanLimits = Record<LimitKey, number>

export type ReadOnlyReason =
  | 'trial_expired'
  | 'subscription_canceled'
  | 'payment_past_due'
  | 'subscription_unpaid'

export type SubscriptionStatusValue =
  | 'TRIALING'
  | 'ACTIVE'
  | 'PAST_DUE'
  | 'CANCELED'
  | 'UNPAID'
  | 'INCOMPLETE'

export type Entitlements = {
  plan: 'FREE' | 'STARTER' | 'PRO'
  status: SubscriptionStatusValue
  /** True when the org may not perform write actions (subscription inactive and not in a valid trial). */
  isReadOnly: boolean
  readOnlyReason: ReadOnlyReason | null
  trialEndsAt: string | null
  trialDaysRemaining: number | null
  trialExpired: boolean
  hasStripeCustomer: boolean
  limits: PlanLimits
}

export type UsageRow = {
  limitKey: LimitKey
  label: string
  used: number
  cap: number
}

export type PlanLimitCheck =
  | { ok: true }
  | { ok: false; error: 'plan_limit' }

const FALLBACK_LIMITS: PlanLimits = { maxUsers: 1, maxJobsPerMonth: 10, maxActiveCustomers: 5 }

function deriveReadOnlyReason(
  org: { subscriptionStatus: SubscriptionStatusValue; trialEndsAt: Date | null },
): ReadOnlyReason | null {
  if (isSubscriptionActive(org)) return null
  if (org.subscriptionStatus === 'TRIALING') return 'trial_expired'
  if (org.subscriptionStatus === 'CANCELED') return 'subscription_canceled'
  if (org.subscriptionStatus === 'PAST_DUE') return 'payment_past_due'
  if (org.subscriptionStatus === 'UNPAID' || org.subscriptionStatus === 'INCOMPLETE') {
    return 'subscription_unpaid'
  }
  return 'trial_expired'
}

/**
 * Resolve the full entitlements DTO for an organization. Org-scoped by the id
 * passed in (always derived server-side from the session).
 */
export async function getEntitlements(
  organizationId: string,
): Promise<Entitlements> {
  const org = await db.organization.findUnique({
    where: { id: organizationId },
    select: {
      plan: true,
      subscriptionStatus: true,
      trialEndsAt: true,
      stripeCustomerId: true,
    },
  })

  const plan = (org?.plan ?? 'FREE') as Entitlements['plan']
  const status: SubscriptionStatusValue = (org?.subscriptionStatus ?? 'CANCELED') as SubscriptionStatusValue
  const trialEndsAt = org?.trialEndsAt ?? null

  const limitsRow = await db.planLimit.findUnique({ where: { plan } })
  const limits: PlanLimits = limitsRow
    ? {
        maxUsers: limitsRow.maxUsers,
        maxJobsPerMonth: limitsRow.maxJobsPerMonth,
        maxActiveCustomers: limitsRow.maxActiveCustomers,
      }
    : FALLBACK_LIMITS

  const active = org ? isSubscriptionActive({ subscriptionStatus: status, trialEndsAt }) : false
  const isReadOnly = !active
  const trialDaysRemaining = org ? getTrialDaysRemaining({ subscriptionStatus: status, trialEndsAt }) : null
  const trialExpired =
    status === 'TRIALING' && !active && (!trialEndsAt || trialEndsAt.getTime() <= Date.now())

  return {
    plan,
    status,
    isReadOnly,
    readOnlyReason: isReadOnly ? (deriveReadOnlyReason({ subscriptionStatus: status, trialEndsAt }) ?? 'trial_expired') : null,
    trialEndsAt: trialEndsAt ? trialEndsAt.toISOString() : null,
    trialDaysRemaining,
    trialExpired,
    hasStripeCustomer: Boolean(org?.stripeCustomerId),
    limits,
  }
}

function startOfMonth(now: Date = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth(), 1)
}

/**
 * Org-scoped usage counts against the plan limits. Each count is filtered by
 * `organizationId` so cross-tenant data can never leak into a usage display.
 */
export async function getUsage(organizationId: string): Promise<UsageRow[]> {
  const entitlements = await getEntitlements(organizationId)
  const limits = entitlements.limits

  const [users, jobsThisMonth, activeCustomers] = await Promise.all([
    db.organizationMember.count({ where: { organizationId } }),
    db.job.count({
      where: { organizationId, createdAt: { gte: startOfMonth() } },
    }),
    db.customer.count({
      where: { organizationId, deletedAt: null },
    }),
  ])

  return [
    { limitKey: 'maxUsers', label: 'Team members', used: users, cap: limits.maxUsers },
    { limitKey: 'maxJobsPerMonth', label: 'Jobs this month', used: jobsThisMonth, cap: limits.maxJobsPerMonth },
    { limitKey: 'maxActiveCustomers', label: 'Active customers', used: activeCustomers, cap: limits.maxActiveCustomers },
  ]
}

/**
 * Canonical enforcement hook for write-path server actions. Returns a typed
 * `{ ok: false, error: 'plan_limit' }` shape that forms can map to an inline
 * upsell, or `{ ok: true }` when the limit still has capacity.
 */
export async function assertWithinPlanLimit(
  organizationId: string,
  limitKey: LimitKey,
): Promise<PlanLimitCheck> {
  const usage = await getUsage(organizationId)
  const row = usage.find((u) => u.limitKey === limitKey)
  if (!row) return { ok: true }
  if (row.used >= row.cap) return { ok: false, error: 'plan_limit' }
  return { ok: true }
}
