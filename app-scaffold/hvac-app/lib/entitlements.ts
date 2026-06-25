import { db } from '@/lib/db'
import { isSubscriptionActive } from '@/lib/billing'

export type EntitlementLimits = {
  teamSeats: { cap: number | null; used: number }
}

export type Entitlements = {
  plan: 'FREE' | 'STARTER' | 'PRO'
  status: 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'CANCELED' | 'UNPAID' | 'INCOMPLETE'
  isActive: boolean
  isReadOnly: boolean
  readOnlyReason: string | null
  trialEndsAt: Date | null
  trialDaysLeft: number | null
  limits: EntitlementLimits
}

type OrgSnapshot = {
  plan: 'FREE' | 'STARTER' | 'PRO'
  subscriptionStatus: 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'CANCELED' | 'UNPAID' | 'INCOMPLETE'
  trialEndsAt: Date | null
  readOnlyAt: Date | null
}

const SEAT_CAPS: Record<string, number | null> = {
  FREE: 1,
  STARTER: 1,
  PRO: null,
}

const READ_ONLY_REASONS: Partial<Record<string, string>> = {
  PAST_DUE: 'Your last payment failed',
  CANCELED: 'Your subscription was canceled',
  UNPAID: 'Payment is required',
  INCOMPLETE: 'Your subscription is incomplete',
}

export function deriveEntitlements(org: OrgSnapshot, teamSeatsUsed: number): Entitlements {
  const isActive = isSubscriptionActive(org)

  const readOnlyReason = org.readOnlyAt
    ? 'Your account has been frozen'
    : (READ_ONLY_REASONS[org.subscriptionStatus] ?? null)

  const isReadOnly = readOnlyReason !== null

  let trialDaysLeft: number | null = null
  if (org.subscriptionStatus === 'TRIALING' && org.trialEndsAt !== null) {
    const diff = org.trialEndsAt.getTime() - Date.now()
    trialDaysLeft = diff > 0 ? Math.ceil(diff / (1000 * 60 * 60 * 24)) : 0
  }

  const cap = SEAT_CAPS[org.plan] ?? 1

  return {
    plan: org.plan,
    status: org.subscriptionStatus,
    isActive,
    isReadOnly,
    readOnlyReason,
    trialEndsAt: org.trialEndsAt,
    trialDaysLeft,
    limits: {
      teamSeats: { cap, used: teamSeatsUsed },
    },
  }
}

export async function getEntitlements(orgId: string): Promise<Entitlements> {
  const [org, teamSeatsUsed] = await Promise.all([
    db.organization.findUniqueOrThrow({ where: { id: orgId } }),
    db.organizationMember.count({ where: { organizationId: orgId } }),
  ])

  return deriveEntitlements(org as OrgSnapshot, teamSeatsUsed)
}
