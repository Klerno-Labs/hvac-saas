import type Stripe from 'stripe'

export const TERMINAL_PAYMENT_METHOD = 'terminal' as const
export const CHECKOUT_PAYMENT_METHOD = 'checkout' as const

export type TerminalEligibility = {
  eligible: boolean
  reason?: string
}

type EligibilityOrg = {
  stripeConnectedAccountId: string | null
  stripeChargesEnabled: boolean
  stripeTerminalEnabled: boolean
}

export function getTerminalEligibility(org: EligibilityOrg): TerminalEligibility {
  if (!org.stripeConnectedAccountId) {
    return { eligible: false, reason: 'Stripe Connect is not set up for this organization.' }
  }
  if (!org.stripeChargesEnabled) {
    return { eligible: false, reason: 'Stripe charges are not enabled. Complete Stripe onboarding first.' }
  }
  if (!org.stripeTerminalEnabled) {
    return { eligible: false, reason: 'In-field card payments are turned off. Enable Stripe Terminal in Settings.' }
  }
  return { eligible: true }
}

type CollectableInvoice = {
  status: string
  outstandingCents: number
  totalCents: number
}

export function resolveCollectAmountCents(invoice: CollectableInvoice): number | null {
  if (!['sent', 'overdue'].includes(invoice.status)) return null
  // A zero balance is settled, even while a status update is still in flight.
  // Never turn it back into the original invoice total.
  if (!Number.isSafeInteger(invoice.outstandingCents) || !Number.isSafeInteger(invoice.totalCents) ||
      invoice.outstandingCents <= 0 || invoice.totalCents <= 0 || invoice.outstandingCents > invoice.totalCents) return null
  return invoice.outstandingCents
}

export function isInvoiceCollectable(invoice: CollectableInvoice): boolean {
  return resolveCollectAmountCents(invoice) !== null
}

type BuildParamsInput = {
  invoiceId: string
  organizationId: string
  invoiceNumber: string
  amountCents: number
  feePercent: number
}

export function buildTerminalPaymentIntentParams(input: BuildParamsInput): Stripe.PaymentIntentCreateParams {
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0 ||
      !Number.isFinite(input.feePercent) || input.feePercent < 0 || input.feePercent > 100) {
    throw new Error('Invalid payment amount or fee')
  }
  const applicationFeeAmount = Math.round(input.amountCents * (input.feePercent / 100))
  return {
    amount: input.amountCents,
    currency: 'usd',
    payment_method_types: ['card_present'],
    capture_method: 'manual',
    application_fee_amount: applicationFeeAmount > 0 ? applicationFeeAmount : undefined,
    metadata: {
      invoiceId: input.invoiceId,
      organizationId: input.organizationId,
      invoiceNumber: input.invoiceNumber,
      method: TERMINAL_PAYMENT_METHOD,
    },
    description: `Invoice #${input.invoiceNumber}`,
  }
}

export function computeApplicationFeeCents(amountCents: number, feePercent: number): number {
  const fee = Math.round(amountCents * (feePercent / 100))
  return fee > 0 ? fee : 0
}

/** Validate provider truth before returning a reader secret or capturing funds. */
export function matchesTerminalPaymentIntent(
  intent: Stripe.PaymentIntent,
  payment: { invoiceId: string; organizationId: string; amountCents: number },
): boolean {
  return intent.currency === 'usd' && intent.amount === payment.amountCents &&
    intent.capture_method === 'manual' && intent.payment_method_types.length === 1 &&
    intent.payment_method_types[0] === 'card_present' &&
    intent.metadata.invoiceId === payment.invoiceId &&
    intent.metadata.organizationId === payment.organizationId &&
    intent.metadata.method === TERMINAL_PAYMENT_METHOD &&
    (intent.status !== 'requires_capture' || intent.amount_capturable === payment.amountCents) &&
    (intent.status !== 'succeeded' || intent.amount_received === payment.amountCents)
}
