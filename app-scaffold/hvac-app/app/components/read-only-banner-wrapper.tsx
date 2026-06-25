import { getOptionalSession } from '@/lib/session'
import { deriveEntitlements } from '@/lib/entitlements'
import { ReadOnlyBanner } from './read-only-banner'

export async function ReadOnlyBannerWrapper() {
  const session = await getOptionalSession()
  if (!session?.membership?.organization) return null

  const org = session.membership.organization

  // deriveEntitlements is a pure function; pass 0 for seats — we only need isReadOnly here.
  // Seat count does not affect read-only status.
  const ent = deriveEntitlements(
    {
      plan: org.plan as 'FREE' | 'STARTER' | 'PRO',
      subscriptionStatus: org.subscriptionStatus as 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'CANCELED' | 'UNPAID' | 'INCOMPLETE',
      trialEndsAt: org.trialEndsAt,
      readOnlyAt: org.readOnlyAt ?? null,
    },
    0
  )

  if (!ent.isReadOnly) return null

  return <ReadOnlyBanner reason={ent.readOnlyReason!} />
}
