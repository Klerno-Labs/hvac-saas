'use server'

import { db } from '@/lib/db'
import { trackEvent } from '@/lib/events'
import { getStripe } from '@/lib/stripe'
import { validatePortalToken } from '@/lib/portal'
import { computeDepositApplicationFeeCents } from '@/lib/deposit'

type CreateDepositCheckoutResult =
  | { success: true; checkoutUrl: string }
  | { success: false; error: string }

export async function createDepositCheckoutSession(
  token: string,
  estimateId: string,
): Promise<CreateDepositCheckoutResult> {
  const ctx = await validatePortalToken(token)
  if (!ctx) {
    return { success: false, error: 'Invalid or expired portal link' }
  }

  const org = await db.organization.findUnique({ where: { id: ctx.organizationId } })
  if (!org?.stripeConnectedAccountId || !org.stripeChargesEnabled) {
    return { success: false, error: 'Online payment is not available at this time' }
  }

  const estimate = await db.estimate.findFirst({
    where: {
      id: estimateId,
      organizationId: ctx.organizationId,
      job: { customerId: ctx.customerId },
    },
    include: { job: { include: { customer: true } } },
  })

  if (!estimate) {
    return { success: false, error: 'Estimate not found' }
  }

  if (estimate.status !== 'accepted') {
    return { success: false, error: 'Deposit can only be collected on an accepted estimate' }
  }

  if (estimate.depositStatus === 'paid') {
    return { success: false, error: 'Deposit has already been paid' }
  }

  if (estimate.depositStatus !== 'required' || estimate.depositAmountCents <= 0) {
    return { success: false, error: 'No deposit is required for this estimate' }
  }

  const stripe = getStripe()
  const appUrl = process.env.APP_URL || 'http://localhost:3000'

  const depositAmountCents = estimate.depositAmountCents
  const feePercent = org.platformFeePercent || 2.9
  const applicationFeeAmount = computeDepositApplicationFeeCents(depositAmountCents, feePercent)

  const depositMeta = {
    depositForEstimateId: estimate.id,
    organizationId: ctx.organizationId,
  }

  const checkoutSession = await stripe.checkout.sessions.create(
    {
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: { name: `Deposit — Estimate #${estimate.estimateNumber}` },
            unit_amount: depositAmountCents,
          },
          quantity: 1,
        },
      ],
      payment_intent_data: {
        application_fee_amount: applicationFeeAmount > 0 ? applicationFeeAmount : undefined,
        metadata: depositMeta,
      },
      success_url: `${appUrl}/portal/${token}/estimates/${estimate.id}?deposit=success`,
      cancel_url: `${appUrl}/portal/${token}/estimates/${estimate.id}`,
      metadata: depositMeta,
      customer_email: estimate.job.customer.email || undefined,
    },
    { stripeAccount: org.stripeConnectedAccountId },
  )

  if (checkoutSession.payment_intent) {
    const piId =
      typeof checkoutSession.payment_intent === 'string'
        ? checkoutSession.payment_intent
        : checkoutSession.payment_intent.id

    const existing = await db.payment.findUnique({ where: { stripePaymentIntent: piId } })
    if (!existing) {
      await db.payment.create({
        data: {
          organizationId: ctx.organizationId,
          estimateId: estimate.id,
          kind: 'deposit',
          stripePaymentIntent: piId,
          amountCents: depositAmountCents,
          status: 'pending',
        },
      })
    }
  }

  await trackEvent({
    organizationId: ctx.organizationId,
    eventName: 'customer_portal_deposit_initiated',
    entityType: 'estimate',
    entityId: estimate.id,
    metadataJson: { checkoutSessionId: checkoutSession.id },
  })

  return { success: true, checkoutUrl: checkoutSession.url! }
}
