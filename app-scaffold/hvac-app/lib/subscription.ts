/**
 * Returns the number of full days remaining in the organization's trial,
 * or null if the org is not trialing or has no trial end date.
 */
export function getTrialDaysRemaining(org: {
  subscriptionStatus: string
  trialEndsAt: Date | null
}): number | null {
  if (org.subscriptionStatus.toLowerCase() !== 'trialing') return null
  if (!org.trialEndsAt) return null

  const now = new Date()
  const diff = org.trialEndsAt.getTime() - now.getTime()
  if (diff <= 0) return 0

  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}
