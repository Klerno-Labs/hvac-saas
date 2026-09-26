'use server'

import type Stripe from 'stripe'
import { requireMutationAccess, jobAccessWhere } from '@/lib/mutation-access'
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

async function resolveOrgCtx() {
  const access = await requireMutationAccess('fieldWork')
  return access.authorized ? access.context : { error: access.error }
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
    where: { id: invoiceId, organizationId, job: jobAccessWhere(ctx) },
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
    feePercent: org.platformFeePercent ?? 2.9,
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
    return { success: false, error: 'Payment has no linked invoice' }
  }
  const job = await db.job.findFirst({ where: { id: invoice.jobId, ...jobAccessWhere(ctx) } })
  if (!job) return { success: false, error: 'Job not found in your assigned work' }
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

  if (succeededIntent.status !== 'succeeded') {
    return { success: false, error: 'Payment is still processing. Wait for confirmation before trying again.' }
  }
  // The signed payment_intent.succeeded webhook updates the invoice and ledger.

  await trackEvent({
    organizationId,
    userId,
    eventName: 'terminal_payment_captured',
    entityType: 'invoice',
    entityId: invoice.id,
    metadataJson: { paymentIntentId, amountCents: payment.amountCents },
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
