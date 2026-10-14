'use server'

import { requireAdmin } from '@/lib/require-admin'
import { createSubscriptionCheckout, type PlanId } from '@/lib/billing'

export async function subscribe(planId: string, _userEmail?: string): Promise<{ url: string } | { error: string }> {
  const adminResult = await requireAdmin()
  if (!adminResult.authorized) return { error: adminResult.error }

  if (planId !== 'starter' && planId !== 'pro') return {error: 'Choose a valid subscription plan'}
  if (!adminResult.context.userEmail) return {error: 'Your account needs an email address'}
  return createSubscriptionCheckout({
    organizationId: adminResult.context.organizationId,
    planId: planId as PlanId,
    userEmail: adminResult.context.userEmail,
  })
}
