import { cache } from 'react'
import { canDo, type Capability } from '@/lib/permissions'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { redirect } from 'next/navigation'
import { isSubscriptionActive } from '@/lib/billing'

/**
 * Returns the current authenticated user and their organization context.
 * Redirects to /login if not authenticated.
 * Redirects to /onboarding if authenticated but no organization membership exists.
 */
export async function requireAuth() {
  const context = await getOptionalSession()
  if (!context) redirect('/login')
  const { userId, user, membership } = context

  if (!membership) {
    redirect('/onboarding')
  }

  return {
    userId,
    user,
    organizationId: membership.organizationId,
    organization: membership.organization,
    role: membership.role,
  }
}

/**
 * Wraps requireAuth() and additionally checks that the organization has an
 * active subscription (or is within the trial window).  If the subscription
 * is inactive the user is redirected to /settings/billing so they can upgrade.
 *
 * Use this on pages that should be gated behind an active subscription
 * (dashboard, customers, jobs, estimates, invoices, reminders, reports).
 * Do NOT use on /settings pages — those should remain accessible.
 */
export async function requireActiveSubscription() {
  const ctx = await requireAuth()

  if (!isSubscriptionActive(ctx.organization)) {
    redirect('/settings/billing')
  }

  return ctx
}

/**
 * Returns session if authenticated, null otherwise.
 * Does not redirect — useful for pages that show different content
 * based on auth state (e.g. landing page).
 */
// React cache deduplicates only within a server render, never across requests.
// The page guard and optional shell share reads without retaining stale roles or
// password versions for the next request. Route handlers/actions still validate.
export const getOptionalSession = cache(async function getOptionalSession() {
  const session = await auth()
  if (!session?.user?.id) return null

  const membership = await db.organizationMember.findFirst({
    where: { userId: session.user.id },
    include: { organization: true },
  })

  return {
    userId: session.user.id,
    user: session.user,
    membership,
  }
})

/** Page guard for organization-wide tools containing customer or pricing data. */
export async function requirePageCapability(capability: Capability) {
  const context = await requireActiveSubscription()
  if (!canDo(context.role, capability)) redirect('/field')
  return context
}
