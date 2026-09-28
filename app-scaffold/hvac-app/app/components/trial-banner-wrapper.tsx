import { getOptionalSession } from '@/lib/session'
import { getTrialDaysRemaining } from '@/lib/subscription'
import { TrialBanner } from './trial-banner'
import { unstable_rethrow } from 'next/navigation'

/**
 * Server component that checks the current user's org trial status
 * and renders a banner when the trial has 7 or fewer days remaining.
 */
export async function TrialBannerWrapper() {
  // This banner is optional. Never relax a private page's authorization guard
  // just to keep the public shell available when session storage is unavailable.
  const session = await getOptionalSession().catch(error => {
    unstable_rethrow(error)
    return null
  })
  if (!session?.membership?.organization) return null

  const org = session.membership.organization
  const daysRemaining = getTrialDaysRemaining(org)

  if (daysRemaining === null || daysRemaining > 7) return null

  return <TrialBanner daysRemaining={daysRemaining} />
}
