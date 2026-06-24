'use server'

import { db } from '@/lib/db'
import { trackEvent } from '@/lib/events'
import { logAudit } from '@/lib/audit'
import { requireAdmin } from '@/lib/require-admin'
import { getStripe } from '@/lib/stripe'

type ConnectResult =
  | { success: true; url: string }
  | { success: false; error: string }

export async function startStripeOnboarding(): Promise<ConnectResult> {
  const adminResult = await requireAdmin()
  if (!adminResult.authorized) {
    return { success: false, error: adminResult.error }
  }

  const { userId, organizationId } = adminResult.context

  const org = await db.organization.findUnique({ where: { id: organizationId } })
  if (!org) {
    return { success: false, error: 'Organization not found' }
  }

  const stripe = getStripe()
  const appUrl = process.env.APP_URL || 'http://localhost:3000'

  let accountId = org.stripeConnectedAccountId

  if (!accountId) {
    try {
      const account = await stripe.accounts.create({
        type: 'express',
        metadata: { organizationId },
      })
      accountId = account.id
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to create Stripe account'
      if (msg.includes('Connect')) {
        return { success: false, error: 'Stripe Connect is not enabled on this platform account. Enable it at dashboard.stripe.com/connect' }
      }
      return { success: false, error: msg }
    }

    await db.organization.update({
      where: { id: organizationId },
      data: { stripeConnectedAccountId: accountId },
    })
  }

  const accountLink = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: `${appUrl}/settings/stripe/callback?refresh=true`,
    return_url: `${appUrl}/settings/stripe/callback`,
    type: 'account_onboarding',
  })

  await trackEvent({
    organizationId,
    userId,
    eventName: 'stripe_connect_started',
    entityType: 'organization',
    entityId: organizationId,
  })

  await logAudit({
    organizationId,
    actorId: userId,
    eventType: 'stripe_connection_started',
    targetType: 'organization',
    targetId: organizationId,
  })

  return { success: true, url: accountLink.url }
}

type RefreshResult =
  | { success: true; chargesEnabled: boolean; payoutsEnabled: boolean }
  | { success: false; error: string }

export async function refreshStripeStatus(): Promise<RefreshResult> {
  const adminResult = await requireAdmin()
  if (!adminResult.authorized) {
    return { success: false, error: adminResult.error }
  }

  const { userId, organizationId } = adminResult.context

  const org = await db.organization.findUnique({ where: { id: organizationId } })
  if (!org || !org.stripeConnectedAccountId) {
    return { success: false, error: 'No Stripe account connected' }
  }

  const stripe = getStripe()
  const account = await stripe.accounts.retrieve(org.stripeConnectedAccountId)

  const chargesEnabled = account.charges_enabled ?? false
  const payoutsEnabled = account.payouts_enabled ?? false

  await db.organization.update({
    where: { id: org.id },
    data: { stripeChargesEnabled: chargesEnabled, stripePayoutsEnabled: payoutsEnabled },
  })

  if (chargesEnabled && !org.stripeChargesEnabled) {
    await trackEvent({
      organizationId: org.id,
      userId,
      eventName: 'stripe_connect_completed',
      entityType: 'organization',
      entityId: org.id,
    })

    await logAudit({
      organizationId,
      actorId: userId,
      eventType: 'stripe_connection_completed',
      targetType: 'organization',
      targetId: organizationId,
      metadata: { chargesEnabled, payoutsEnabled },
    })
  }

  return { success: true, chargesEnabled, payoutsEnabled }
}

type TerminalResult =
  | { success: true; enabled: boolean }
  | { success: false; error: string }

export async function setTerminalEnabled(enabled: boolean): Promise<TerminalResult> {
  const adminResult = await requireAdmin()
  if (!adminResult.authorized) {
    return { success: false, error: adminResult.error }
  }

  const { userId, organizationId } = adminResult.context

  const org = await db.organization.findUnique({ where: { id: organizationId } })
  if (!org) {
    return { success: false, error: 'Organization not found' }
  }

  if (enabled && (!org.stripeConnectedAccountId || !org.stripeChargesEnabled)) {
    return {
      success: false,
      error: 'Connect Stripe and complete onboarding (charges enabled) before enabling Terminal.',
    }
  }

  await db.organization.update({
    where: { id: organizationId },
    data: { stripeTerminalEnabled: enabled },
  })

  await trackEvent({
    organizationId,
    userId,
    eventName: enabled ? 'stripe_terminal_enabled' : 'stripe_terminal_disabled',
    entityType: 'organization',
    entityId: organizationId,
  })

  await logAudit({
    organizationId,
    actorId: userId,
    eventType: enabled ? 'stripe_terminal_enabled' : 'stripe_terminal_disabled',
    targetType: 'organization',
    targetId: organizationId,
  })

  return { success: true, enabled }
}
