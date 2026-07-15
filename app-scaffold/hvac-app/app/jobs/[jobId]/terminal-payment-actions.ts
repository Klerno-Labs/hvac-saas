'use server'

import type Stripe from 'stripe'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { getStripe } from '@/lib/stripe'
import { trackEvent } from '@/lib/events'
import { logAudit } from '@/lib/audit'
import {
  getTerminalEligibility,
  resolveCollectAmountCents,
  buildTerminalPaymentIntentParams,
  TERMINAL_PAYMENT_METHOD,
} from '@/lib/terminal'

type AuthCtx = { userId: string; organizationId: string }

async function resolveOrgCtx(): Promise<AuthCtx | { error: string }> {
  const session = await auth()
  if (!session?.user?.id) {
    return { error: 'You must be logged in' }
  }
  const membership = await db.organizationMember.findFirst({
    where: { userId: session.user.id },
  })
  if (!membership) {
    return { error: 'You must belong to an organization' }
  }
  return { userId: session.user.id, organizationId: membership.organizationId }
}

export type CreateIntentResult =
  | { success: true; paymentIntentId: string; clientSecret: string; amountCents: number }
  | { success: false; error: string }

export async function createTerminalPaymentIntent(
  invoiceId: string,
): Promise<CreateIntentResult> {
  const ctx = await resolveOrgCtx()
  if ('error' in ctx) return { success: false, error: ctx.error }
  const { userId, organizationId } = ctx

  const org = await db.organization.findUnique({ where: { id: organizationId } })
  if (!org) return { success: false, error: 'Organization not found' }

  const eligibility = getTerminalEligibility(org)
  if (!eligibility.eligible) {
    return { success: false, error: eligibility.reason ?? 'Stripe Terminal is not available.' }
  }

  const invoice = await db.invoice.findFirst({
    where: { id: invoiceId, organizationId },
    include: { customer: true },
  })
  if (!invoice) {
    return { success: false, error: 'Invoice not found in your organization' }
  }

  const amountCents = resolveCollectAmountCents(invoice)
  if (amountCents === null) {
    return { success: false, error: 'This invoice cannot be collected (paid, void, draft, or zero amount).' }
  }

  const stripe = getStripe()
  const params = buildTerminalPaymentIntentParams({
    invoiceId: invoice.id,
    organizationId,
    invoiceNumber: invoice.invoiceNumber,
    amountCents,
    feePercent: org.platformFeePercent || 2.9,
  })

  let intent: Stripe.PaymentIntent
  try {
    intent = await stripe.paymentIntents.create(params, {
      stripeAccount: org.stripeConnectedAccountId!,
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Failed to create Stripe Terminal PaymentIntent'
    return { success: false, error: msg }
  }

  await db.payment.create({
    data: {
      organizationId,
      invoiceId: invoice.id,
      stripePaymentIntent: intent.id,
      amountCents,
      method: TERMINAL_PAYMENT_METHOD,
      status: 'pending',
    },
  })

  await trackEvent({
    organizationId,
    userId,
    eventName: 'terminal_payment_intent_created',
    entityType: 'invoice',
    entityId: invoice.id,
    metadataJson: { paymentIntentId: intent.id, amountCents },
  })

  return {
    success: true,
    paymentIntentId: intent.id,
    clientSecret: intent.client_secret!,
    amountCents,
  }
}

export type CaptureResult =
  | { success: true; paymentIntentId: string; invoiceId: string }
  | { success: false; error: string }

export async function captureTerminalPayment(paymentIntentId: string): Promise<CaptureResult> {
  const ctx = await resolveOrgCtx()
  if ('error' in ctx) return { success: false, error: ctx.error }
  const { userId, organizationId } = ctx

  const payment = await db.payment.findUnique({
    where: { stripePaymentIntent: paymentIntentId },
    include: { invoice: true },
  })
  if (!payment || payment.organizationId !== organizationId) {
    return { success: false, error: 'Payment not found in your organization' }
  }

  const invoice = payment.invoice
  if (!invoice) {
    return { success: false, error: 'Payment has no associated invoice' }
  }
  if (invoice.status === 'paid') {
    return { success: true, paymentIntentId, invoiceId: invoice.id }
  }

  const org = await db.organization.findUnique({ where: { id: organizationId } })
  if (!org?.stripeConnectedAccountId) {
    return { success: false, error: 'Stripe Connect is not configured' }
  }

  const stripe = getStripe()
  const stripeAccount = org.stripeConnectedAccountId

  let succeededIntent: Stripe.PaymentIntent
  try {
    const current = await stripe.paymentIntents.retrieve(paymentIntentId, { stripeAccount })

    if (current.status === 'succeeded') {
      succeededIntent = current
    } else if (current.status === 'requires_capture') {
      succeededIntent = await stripe.paymentIntents.capture(paymentIntentId, { stripeAccount })
    } else {
      return {
        success: false,
        error: `Cannot capture a PaymentIntent in status "${current.status}". Re-attempt the tap.`,
      }
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Failed to capture PaymentIntent'
    return { success: false, error: msg }
  }

  await db.$transaction(async (tx) => {
    await tx.invoice.update({
      where: { id: invoice.id },
      data: {
        status: 'paid',
        paidAt: new Date(),
        outstandingCents: 0,
      },
    })

    await tx.collectionAttempt.updateMany({
      where: { invoiceId: invoice.id, status: 'created' },
      data: { status: 'skipped' },
    })

    await tx.payment.update({
      where: { id: payment.id },
      data: { status: 'succeeded', paidAt: new Date() },
    })
  })

  await trackEvent({
    organizationId,
    userId,
    eventName: 'terminal_payment_captured',
    entityType: 'invoice',
    entityId: invoice.id,
    metadataJson: { paymentIntentId, amountCents: payment.amountCents },
  })

  await trackEvent({
    organizationId,
    eventName: 'collections_stopped_due_to_payment',
    entityType: 'invoice',
    entityId: invoice.id,
  })

  await logAudit({
    organizationId,
    actorId: userId,
    eventType: 'terminal_payment_captured',
    targetType: 'invoice',
    targetId: invoice.id,
    metadata: {
      paymentIntentId,
      invoiceNumber: invoice.invoiceNumber,
      amountCents: payment.amountCents,
    },
  })

  return { success: true, paymentIntentId, invoiceId: invoice.id }
}

export type ConnectionTokenResult =
  | { success: true; secret: string }
  | { success: false; error: string }

export async function createTerminalConnectionToken(): Promise<ConnectionTokenResult> {
  const ctx = await resolveOrgCtx()
  if ('error' in ctx) return { success: false, error: ctx.error }
  const { organizationId } = ctx

  const org = await db.organization.findUnique({ where: { id: organizationId } })
  if (!org) return { success: false, error: 'Organization not found' }

  const eligibility = getTerminalEligibility(org)
  if (!eligibility.eligible) {
    return { success: false, error: eligibility.reason ?? 'Stripe Terminal is not available.' }
  }

  const stripe = getStripe()
  try {
    const token = await stripe.terminal.connectionTokens.create(
      {},
      { stripeAccount: org.stripeConnectedAccountId! },
    )
    return { success: true, secret: token.secret }
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Failed to create Terminal connection token'
    return { success: false, error: msg }
  }
}
