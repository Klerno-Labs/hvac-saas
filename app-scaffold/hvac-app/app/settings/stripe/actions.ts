'use server'

import { db } from '@/lib/db'
import { trackEvent } from '@/lib/events'
import { logAudit } from '@/lib/audit'
import { requireAdmin } from '@/lib/require-admin'
import { getStripe } from '@/lib/stripe'
import { revalidatePath } from 'next/cache'

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

  let stripe: ReturnType<typeof getStripe>
  try { stripe = getStripe() } catch {
    return { success: false, error: 'Customer payments are not configured yet. You can continue setting up the rest of your workspace.' }
  }
  const appUrl = process.env.APP_URL || 'http://localhost:3000'

  let accountId = org.stripeConnectedAccountId

  if (!accountId) {
    try {
      const account = await stripe.accounts.create({
        type: 'express',
        capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
        metadata: { organizationId },
      }, { idempotencyKey: `fieldclose-connect:${organizationId}` })
      accountId = account.id
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to create Stripe account'
      if (msg.includes('Connect')) {
        return { success: false, error: 'Online payment connections are not available yet. You can continue setting up the rest of your workspace.' }
      }
      return { success: false, error: 'We could not start customer payment setup. Please try again.' }
    }

    try {
      // Concurrent setup requests must never replace an account already linked
      // to the workspace, including one saved while the provider call ran.
      const saved = await db.organization.updateMany({
        where: { id: organizationId, stripeConnectedAccountId: null },
        data: { stripeConnectedAccountId: accountId },
      })
      if (saved.count !== 1) {
        const current = await db.organization.findUnique({ where: { id: organizationId } })
        if (!current?.stripeConnectedAccountId) throw new Error('Connection was not saved')
        accountId = current.stripeConnectedAccountId
      }
    } catch {
      return { success: false, error: 'Your payment connection could not be saved. Please try again.' }
    }
  }

  let accountLink
  try {
    accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${appUrl}/settings/stripe/callback?refresh=true`,
      return_url: `${appUrl}/settings/stripe/callback`,
      type: 'account_onboarding',
    })
  } catch {
    return { success: false, error: 'We could not open Stripe payment setup. Please try again.' }
  }

  // The account is already bound and its link created. Optional telemetry must
  // not hide a successful setup or encourage a redundant provider operation.
  await trackEvent({
    organizationId,
    userId,
    eventName: 'stripe_connect_started',
    entityType: 'organization',
    entityId: organizationId,
  }).catch(() => { console.error('Stripe connection activity could not be recorded') })

  await logAudit({
    organizationId,
    actorId: userId,
    eventType: 'stripe_connection_started',
    targetType: 'organization',
    targetId: organizationId,
  }).catch(() => { console.error('Stripe connection audit could not be recorded') })

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

  let stripe: ReturnType<typeof getStripe>
  try { stripe = getStripe() } catch {
    return { success: false, error: 'Customer payments are not configured yet. Your existing business records are unchanged.' }
  }
  const mode = process.env.STRIPE_SECRET_KEY?.trim().match(/^(?:sk|rk)_(live|test)_/)?.[1] ?? 'unknown'
  let account
  try { account = await stripe.accounts.retrieve(org.stripeConnectedAccountId) } catch {
    await logAudit({ organizationId, actorId: userId, eventType: 'stripe_account_verification_failed',
      targetType: 'organization', targetId: organizationId, metadata: { mode, accountId: org.stripeConnectedAccountId } }).catch(() => {})
    return { success: false, error: 'We could not refresh your Stripe status. Please try again.' }
  }

  const chargesEnabled = account.charges_enabled ?? false
  const payoutsEnabled = account.payouts_enabled ?? false

  try {
    await db.$transaction(async tx => {
      const updated = await tx.organization.updateMany({
        where: { id: org.id, stripeConnectedAccountId: account.id },
        data: { stripeChargesEnabled: chargesEnabled, stripePayoutsEnabled: payoutsEnabled },
      })
      if (updated.count !== 1) throw new Error('Connected account changed during refresh')
      await logAudit({ organizationId, actorId: userId, eventType: 'stripe_account_verified',
        targetType: 'organization', targetId: organizationId,
        metadata: { mode, accountId: account.id, chargesEnabled, payoutsEnabled } }, tx)
    })
  } catch {
    return { success: false, error: 'Your Stripe status could not be saved. Please refresh it again.' }
  }

  // The provider-verified audit above is required and atomic; these completion
  // notifications are best-effort after the verified status has committed.
  if (chargesEnabled && !org.stripeChargesEnabled) {
    await trackEvent({
      organizationId: org.id,
      userId,
      eventName: 'stripe_connect_completed',
      entityType: 'organization',
      entityId: org.id,
    }).catch(() => { console.error('Stripe connection activity could not be recorded') })

    await logAudit({
      organizationId,
      actorId: userId,
      eventType: 'stripe_connection_completed',
      targetType: 'organization',
      targetId: organizationId,
      metadata: { chargesEnabled, payoutsEnabled },
    }).catch(() => { console.error('Stripe connection audit could not be recorded') })
  }

  revalidatePath('/setup')
  revalidatePath('/dashboard')
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
