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
  const session = await auth()

  if (!session?.user?.id) {
    redirect('/login')
  }

  const userId = session.user.id

  const membership = await db.organizationMember.findFirst({
    where: { userId },
    include: { organization: true },
  })

  if (!membership) {
    redirect('/onboarding')
  }

  return {
    userId,
    user: session.user,
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
export async function getOptionalSession() {
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
}

/** Page guard for organization-wide tools containing customer or pricing data. */
export async function requirePageCapability(capability: Capability) {
  const context = await requireActiveSubscription()
  if (!canDo(context.role, capability)) redirect('/field')
  return context
}
