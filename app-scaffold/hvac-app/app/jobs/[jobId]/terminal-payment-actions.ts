'use server'

import type Stripe from 'stripe'
import {
  reserveInvoicePaymentAttempt, saveInvoicePaymentProviderId,
  releaseInvoicePaymentLease, retireInvoicePaymentAttempt, claimInvoicePaymentAttemptForCancellation,
} from '@/lib/invoice-payment-attempt'
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
  matchesTerminalPaymentIntent,
} from '@/lib/terminal'

async function resolveOrgCtx() {
  const access = await requireMutationAccess('fieldWork')
  return access.authorized ? access.context : { error: access.error }
}

export type CreateIntentResult =
  | { success: true; paymentIntentId: string; clientSecret: string; amountCents: number; readyForCapture?: false }
  | { success: true; paymentIntentId: string; amountCents: number; readyForCapture: true }
  | { success: false; error: string }

export async function createTerminalPaymentIntent(
  invoiceId: string,
): Promise<CreateIntentResult> {
  const ctx = await resolveOrgCtx()
  if ('error' in ctx) return { success: false, error: ctx.error }
  const { userId, organizationId } = ctx
  let stripe: ReturnType<typeof getStripe>
  try { stripe = getStripe() } catch {
    return { success: false, error: 'Card payments are temporarily unavailable. Ask the owner to review payment setup.' }
  }
  const org = await db.organization.findUnique({ where: { id: organizationId } })
  if (!org) return { success: false, error: 'Organization not found' }
  const eligibility = getTerminalEligibility(org)
  if (!eligibility.eligible) return { success: false, error: eligibility.reason ?? 'Stripe Terminal is not available.' }

  const reserved = await reserveInvoicePaymentAttempt({
    invoiceId, organizationId, method: TERMINAL_PAYMENT_METHOD,
    invoiceWhere: { job: jobAccessWhere(ctx), customer: { deletedAt: null } },
    buildParams: invoice => {
      if (!getTerminalEligibility(invoice.organization).eligible) throw new Error('Terminal setup changed')
      return buildTerminalPaymentIntentParams({
        invoiceId: invoice.id, organizationId, invoiceNumber: invoice.invoiceNumber,
        amountCents: invoice.outstandingCents, feePercent: invoice.organization.platformFeePercent ?? 2.9,
      })
    },
  })
  if (!reserved.success) return reserved
  const { attempt } = reserved
  const providerOptions = { stripeAccount: attempt.connectedAccountId, timeout: 10_000, maxNetworkRetries: 0 }
  try {
    const intent = attempt.providerId
      ? await stripe.paymentIntents.retrieve(attempt.providerId, {}, providerOptions)
      : await stripe.paymentIntents.create(attempt.params as unknown as Stripe.PaymentIntentCreateParams, {
        ...providerOptions, idempotencyKey: `invoice-payment:${attempt.id}`,
      })
    if ((attempt.providerId && intent.id !== attempt.providerId) || !matchesTerminalPaymentIntent(intent, { invoiceId, organizationId, amountCents: attempt.amountCents })) {
      return { success: false, error: 'The existing payment does not match this invoice. Ask the owner to review it before collecting again.' }
    }
    if (intent.status === 'canceled') {
      if (!await retireInvoicePaymentAttempt(attempt)) return { success: false, error: 'Payment setup changed. Refresh before trying again.' }
      return { success: false, error: 'The previous card attempt was canceled. You can start a new attempt.' }
    }
    // Save provider identity before returning a reader secret. A lost response
    // reuses this attempt/key instead of creating another collectible intent.
    if (!await saveInvoicePaymentProviderId(attempt, intent.id)) {
      return { success: false, error: 'Payment setup could not be saved. Refresh and check the existing attempt before collecting again.' }
    }
    if (intent.status === 'requires_capture') {
      // Resume an existing authorization after refresh or an interrupted capture;
      // the client must skip reader collection and capture this exact intent.
      return { success: true, paymentIntentId: intent.id, amountCents: attempt.amountCents, readyForCapture: true }
    }
    if (!['requires_payment_method', 'requires_confirmation'].includes(intent.status)) {
      return { success: false, error: 'A card payment is already processing. Wait for confirmation before collecting again.' }
    }
    if (!intent.client_secret) return { success: false, error: 'The payment reader could not be prepared. Please refresh and try again.' }
    await trackEvent({
      organizationId, userId, eventName: 'terminal_payment_intent_created',
      entityType: 'invoice', entityId: invoiceId,
      metadataJson: { paymentIntentId: intent.id, amountCents: attempt.amountCents },
    }).catch(() => { console.error('Terminal payment activity could not be recorded') })
    return { success: true, paymentIntentId: intent.id, clientSecret: intent.client_secret, amountCents: attempt.amountCents }
  } catch {
    return { success: false, error: 'We could not confirm payment setup. Refresh and check the existing attempt before collecting again.' }
  } finally {
    await releaseInvoicePaymentLease(attempt).catch(() => { console.error('Terminal payment reservation could not be released') })
  }
}

export type CaptureResult =
  | { success: true; paymentIntentId: string; invoiceId: string }
  | { success: false; error: string }

export async function captureTerminalPayment(paymentIntentId: string): Promise<CaptureResult> {
  const ctx = await resolveOrgCtx()
  if ('error' in ctx) return { success: false, error: ctx.error }
  const { userId, organizationId } = ctx
  let stripe: ReturnType<typeof getStripe>
  try { stripe = getStripe() } catch {
    return { success: false, error: 'Card payments are temporarily unavailable. Ask the owner to review payment setup.' }
  }
  const payment = await db.payment.findUnique({ where: { stripePaymentIntent: paymentIntentId }, include: { invoice: true } })
  if (!payment || payment.organizationId !== organizationId || payment.method !== TERMINAL_PAYMENT_METHOD ||
      !payment.invoice || payment.invoice.organizationId !== organizationId) {
    return { success: false, error: 'Card payment not found in your organization' }
  }
  const invoice = payment.invoice
  const job = await db.job.findFirst({ where: { id: invoice.jobId, ...jobAccessWhere(ctx) } })
  if (!job) return { success: false, error: 'Job not found in your assigned work' }
  if (payment.status === 'succeeded' && invoice.status === 'paid') return { success: true, paymentIntentId, invoiceId: invoice.id }
  if (payment.status !== 'pending') return { success: false, error: 'This card attempt is no longer available. Review its status before trying again.' }
  const org = await db.organization.findUnique({ where: { id: organizationId } })
  if (!org?.stripeConnectedAccountId) return { success: false, error: 'Stripe Connect is not configured' }
  const providerOptions = { stripeAccount: org.stripeConnectedAccountId, timeout: 10_000, maxNetworkRetries: 0 }
  try {
    const current = await stripe.paymentIntents.retrieve(paymentIntentId, {}, providerOptions)
    if (current.id !== paymentIntentId || !matchesTerminalPaymentIntent(current, { invoiceId: invoice.id, organizationId, amountCents: payment.amountCents })) {
      return { success: false, error: 'The authorized payment does not match this invoice. Ask the owner to review it before collecting again.' }
    }
    if (!['succeeded', 'requires_capture'].includes(current.status)) {
      return { success: false, error: 'The card payment is not ready to capture. Check the existing attempt before trying again.' }
    }
    if (current.status === 'requires_capture') {
      // This short lock also serializes void and other payment-channel changes.
      // The only external call is bounded at 10s, below the 20s transaction limit.
      const captured = await db.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM "Invoice" WHERE id = ${invoice.id} AND "organizationId" = ${organizationId} FOR UPDATE`
        const fresh = await tx.invoice.findFirst({ where: { id: invoice.id, organizationId, job: jobAccessWhere(ctx) }, include: { organization: true } })
        const saved = await tx.payment.findUnique({ where: { stripePaymentIntent: paymentIntentId } })
        if (!fresh || fresh.organization.stripeConnectedAccountId !== org.stripeConnectedAccountId ||
            resolveCollectAmountCents(fresh) !== payment.amountCents || !saved || saved.status !== 'pending' ||
            saved.invoiceId !== invoice.id || saved.organizationId !== organizationId || saved.method !== TERMINAL_PAYMENT_METHOD) return false
        const capturedIntent = await stripe.paymentIntents.capture(paymentIntentId, {}, {
          ...providerOptions, idempotencyKey: `terminal-capture:${paymentIntentId}`,
        })
        if (capturedIntent.id !== paymentIntentId || capturedIntent.status !== 'succeeded' || !matchesTerminalPaymentIntent(capturedIntent, { invoiceId: invoice.id, organizationId, amountCents: payment.amountCents })) return false
        // Invalidate stale status forms without asserting settlement locally.
        await tx.invoice.update({ where: { id: invoice.id }, data: { updatedAt: new Date() } })
        return true
      }, { maxWait: 5_000, timeout: 20_000 })
      if (!captured) return { success: false, error: 'Payment or invoice status changed. Wait for confirmation and review the existing attempt before collecting again.' }
    }
  } catch {
    return { success: false, error: 'We could not confirm the capture result. Wait for payment confirmation before trying again.' }
  }
  // Signed webhook reconciliation alone updates the paid balance and ledger.
  await trackEvent({ organizationId, userId, eventName: 'terminal_payment_captured', entityType: 'invoice', entityId: invoice.id,
    metadataJson: { paymentIntentId, amountCents: payment.amountCents },
  }).catch(() => { console.error('Terminal capture activity could not be recorded') })
  await logAudit({ organizationId, actorId: userId, eventType: 'terminal_payment_captured', targetType: 'invoice', targetId: invoice.id,
    metadata: { paymentIntentId, invoiceNumber: invoice.invoiceNumber, amountCents: payment.amountCents },
  }).catch(() => { console.error('Terminal capture audit could not be recorded') })
  return { success: true, paymentIntentId, invoiceId: invoice.id }
}

export type CancelTerminalResult = { success: true } | { success: false; error: string }

/** Explicitly abandon only a verified, unprocessed reader attempt. Never called
 * by unmount, disconnect, or an uncertain capture-recovery path. */
export async function cancelTerminalPaymentAttempt(paymentIntentId: string): Promise<CancelTerminalResult> {
  const ctx = await resolveOrgCtx()
  if ('error' in ctx) return { success: false, error: ctx.error }
  const { organizationId, userId } = ctx
  let stripe: ReturnType<typeof getStripe>
  try { stripe = getStripe() } catch {
    return { success: false, error: 'Card payments are temporarily unavailable. Ask the owner to review payment setup.' }
  }
  const payment = await db.payment.findUnique({ where: { stripePaymentIntent: paymentIntentId }, include: { invoice: true } })
  if (!payment || payment.organizationId !== organizationId || payment.method !== TERMINAL_PAYMENT_METHOD ||
      !payment.invoice || payment.invoice.organizationId !== organizationId) {
    return { success: false, error: 'Card payment not found in your organization' }
  }
  const invoice = payment.invoice
  const job = await db.job.findFirst({ where: { id: invoice.jobId, ...jobAccessWhere(ctx) } })
  if (!job) return { success: false, error: 'Job not found in your assigned work' }
  if (payment.status === 'canceled') return { success: true }
  if (payment.status !== 'pending') return { success: false, error: 'This payment can no longer be canceled here. Review its confirmed status.' }
  const claimed = await claimInvoicePaymentAttemptForCancellation({
    invoiceId: invoice.id, organizationId, method: TERMINAL_PAYMENT_METHOD, invoiceWhere: { job: jobAccessWhere(ctx) },
  })
  if (!claimed.success) return claimed
  const attempt = claimed.attempt
  if (!attempt) return { success: false, error: 'The previous card attempt needs review before it can be canceled.' }
  try {
    if (attempt.providerId !== paymentIntentId || attempt.amountCents !== payment.amountCents) {
      return { success: false, error: 'The payment changed. Refresh and review the existing attempt before canceling.' }
    }
    const options = { stripeAccount: attempt.connectedAccountId, timeout: 10_000, maxNetworkRetries: 0 }
    const current = await stripe.paymentIntents.retrieve(paymentIntentId, {}, options)
    if (current.id !== paymentIntentId || current.amount_received !== 0 ||
        !matchesTerminalPaymentIntent(current, { invoiceId: invoice.id, organizationId, amountCents: payment.amountCents })) {
      return { success: false, error: 'The payment could not be matched safely. Ask the owner to review it before canceling.' }
    }
    if (!['requires_payment_method', 'requires_confirmation', 'canceled'].includes(current.status)) {
      return { success: false, error: 'This payment is already authorized or processing. Finish or review the existing payment instead of canceling it here.' }
    }
    const canceled = current.status === 'canceled' ? current : await stripe.paymentIntents.cancel(paymentIntentId, {}, {
      ...options, idempotencyKey: `terminal-cancel:${paymentIntentId}`,
    })
    if (canceled.id !== paymentIntentId || canceled.status !== 'canceled' || canceled.amount_received !== 0 ||
        !matchesTerminalPaymentIntent(canceled, { invoiceId: invoice.id, organizationId, amountCents: payment.amountCents })) {
      return { success: false, error: 'Cancellation could not be confirmed. Check the existing payment before trying another method.' }
    }
    if (!await retireInvoicePaymentAttempt(attempt)) {
      return { success: false, error: 'The canceled payment could not be saved. Refresh and confirm its status before trying another method.' }
    }
    await logAudit({ organizationId, actorId: userId, eventType: 'terminal_payment_canceled', targetType: 'invoice', targetId: invoice.id,
      metadata: { paymentIntentId, amountCents: payment.amountCents },
    }).catch(() => { console.error('Terminal cancellation audit could not be recorded') })
    return { success: true }
  } catch {
    return { success: false, error: 'Cancellation could not be confirmed. Check the existing payment before trying another method.' }
  } finally {
    await releaseInvoicePaymentLease(attempt).catch(() => { console.error('Terminal cancellation reservation could not be released') })
  }
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

  let stripe: ReturnType<typeof getStripe>
  try { stripe = getStripe() } catch {
    return { success: false, error: 'Card payments are temporarily unavailable. Ask the owner to review payment setup.' }
  }
  try {
    const token = await stripe.terminal.connectionTokens.create(
      {},
      { stripeAccount: org.stripeConnectedAccountId!, timeout: 10_000, maxNetworkRetries: 0 },
    )
    return { success: true, secret: token.secret }
  } catch {
    return { success: false, error: 'The card reader connection could not be prepared. Please try again.' }
  }
}
