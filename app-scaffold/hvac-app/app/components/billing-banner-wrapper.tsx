import { getOptionalSession } from '@/lib/session'
import { isSubscriptionActive } from '@/lib/billing'
import { getTrialDaysRemaining } from '@/lib/subscription'
import { TrialBanner } from './trial-banner'
import { ReadOnlyBanner, type ReadOnlyReasonKey } from '@/components/billing/read-only-banner'

/**
 * Server component rendered in the root layout. Performs a single per-request
 * session/org fetch (reused from lib/session) and renders EITHER a read-only
 * banner for frozen orgs (priority) OR the existing trial-ending banner — never
 * both, and nothing for fully writable orgs.
 */
export async function BillingBannerWrapper() {
  const session = await getOptionalSession()
  if (!session?.membership?.organization) return null

  const org = session.membership.organization
  const active = isSubscriptionActive(org)

  if (!active) {
    const reason: ReadOnlyReasonKey =
      org.subscriptionStatus === 'TRIALING'
        ? 'trial_expired'
        : org.subscriptionStatus === 'CANCELED'
          ? 'subscription_canceled'
          : org.subscriptionStatus === 'PAST_DUE'
            ? 'payment_past_due'
            : org.subscriptionStatus === 'UNPAID' || org.subscriptionStatus === 'INCOMPLETE'
              ? 'subscription_unpaid'
              : 'inactive'
    return <ReadOnlyBanner reason={reason} />
  }

  const daysRemaining = getTrialDaysRemaining(org)
  if (daysRemaining === null || daysRemaining > 7) return null

  return <TrialBanner daysRemaining={daysRemaining} />
}
