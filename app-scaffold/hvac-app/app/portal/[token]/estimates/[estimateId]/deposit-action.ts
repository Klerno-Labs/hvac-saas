'use server'

import { db } from '@/lib/db'
import { validatePortalToken } from '@/lib/portal'
import { getStripe } from '@/lib/stripe'
import { trackEvent } from '@/lib/events'

type CreateDepositResult =
  | { success: true; checkoutUrl: string }
  | { success: false; error: string }

export async function createDepositCheckoutSession(
  token: string,
  estimateId: string,
): Promise<CreateDepositResult> {
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
      status: 'accepted',
      depositRequired: true,
    },
    include: { job: { include: { customer: { select: { email: true } } } } },
  })

  if (!estimate) {
    return { success: false, error: 'Estimate not found or deposit not required' }
  }
  if (estimate.depositStatus === 'paid') {
    return { success: false, error: 'Deposit has already been paid' }
  }
  if (!estimate.depositAmountCents || estimate.depositAmountCents <= 0) {
    return { success: false, error: 'Deposit amount is not configured' }
  }

  const stripe = getStripe()
  const appUrl = process.env.APP_URL || 'http://localhost:3000'
  const feePercent = org.platformFeePercent || 2.9
  const applicationFeeAmount = Math.round(estimate.depositAmountCents * (feePercent / 100))

  const session = await stripe.checkout.sessions.create(
    {
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: { name: `Deposit for Estimate #${estimate.estimateNumber}` },
            unit_amount: estimate.depositAmountCents,
          },
          quantity: 1,
        },
      ],
      payment_intent_data: {
        application_fee_amount: applicationFeeAmount > 0 ? applicationFeeAmount : undefined,
        metadata: {
          estimateId: estimate.id,
          organizationId: ctx.organizationId,
          type: 'estimate_deposit',
        },
      },
      success_url: `${appUrl}/portal/${token}/estimates/${estimate.id}?deposit=success`,
      cancel_url: `${appUrl}/portal/${token}/estimates/${estimate.id}`,
      customer_email: estimate.job.customer.email || undefined,
      metadata: {
        estimateId: estimate.id,
        organizationId: ctx.organizationId,
        type: 'estimate_deposit',
      },
    },
    { stripeAccount: org.stripeConnectedAccountId },
  )

  await trackEvent({
    organizationId: ctx.organizationId,
    eventName: 'customer_deposit_payment_initiated',
    entityType: 'estimate',
    entityId: estimate.id,
    metadataJson: { checkoutSessionId: session.id },
  })

  return { success: true, checkoutUrl: session.url! }
}
