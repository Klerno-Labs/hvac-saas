import { DefaultSession } from 'next-auth'
import type {
  PlanId,
  SubscriptionStatus,
} from '@/lib/entitlements'

/**
 * Entitlement snapshot exposed on the session for edge-safe middleware reads.
 * `trialEndsAt` is an ISO string so the value survives JWT serialization.
 */
export type SessionOrg = {
  id: string
  plan: PlanId
  subscriptionStatus: SubscriptionStatus
  trialEndsAt: string | null
}

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
    } & DefaultSession['user']
    org?: SessionOrg
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id?: string
    organizationId?: string
    plan?: PlanId
    subscriptionStatus?: SubscriptionStatus
    trialEndsAt?: string | null
  }
}
