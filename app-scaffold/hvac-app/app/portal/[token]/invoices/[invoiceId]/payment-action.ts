'use server'

import { db } from '@/lib/db'
import { trackEvent } from '@/lib/events'
import { getStripe } from '@/lib/stripe'
import { validatePortalToken } from '@/lib/portal'
import { headers } from 'next/headers'
import { limit, RL, extractIp } from '@/lib/rate-limit'
import { assertRateLimit, RateLimitError } from '@/lib/rate-limit/respond'

type CreateCheckoutResult =
  | { success: true; checkoutUrl: string }
  | { success: false; error: string }

export async function createPortalCheckoutSession(
  token: string,
  invoiceId: string,
): Promise<CreateCheckoutResult> {
  const guard = await limit({ preset: RL.publicPay, ip: extractIp(await headers()), id: token })
  try {
    assertRateLimit(guard)
  } catch (e) {
    if (e instanceof RateLimitError) {
      return { success: false, error: `Too many attempts. Try again in ${e.retryAfterSeconds}s.` }
    }
    throw e
  }

  const ctx = await validatePortalToken(token)
  if (!ctx) {
    return { success: false, error: 'Invalid or expired portal link' }
  }

  const org = await db.organization.findUnique({ where: { id: ctx.organizationId } })
  if (!org?.stripeConnectedAccountId || !org.stripeChargesEnabled) {
    return { success: false, error: 'Online payment is not available at this time' }
  }

  const invoice = await db.invoice.findFirst({
    where: {
      id: invoiceId,
      organizationId: ctx.organizationId,
      customerId: ctx.customerId,
    },
    include: {
      customer: { select: { email: true } },
      lineItems: { orderBy: { sortOrder: 'asc' } },
    },
  })

  if (!invoice) {
    return { success: false, error: 'Invoice not found' }
  }

  if (invoice.status === 'paid' || invoice.status === 'void' || invoice.status === 'draft') {
    return { success: false, error: `This invoice cannot be paid (status: ${invoice.status})` }
  }

  if (invoice.totalCents <= 0) {
    return { success: false, error: 'Invoice total must be greater than zero' }
  }

  // Reuse existing checkout session if valid
  if (invoice.stripeCheckoutSessionId) {
    try {
      const stripe = getStripe()
      const existingSession = await stripe.checkout.sessions.retrieve(
        invoice.stripeCheckoutSessionId,
        { stripeAccount: org.stripeConnectedAccountId },
      )
      if (existingSession.status === 'open' && existingSession.url) {
        return { success: true, checkoutUrl: existingSession.url }
      }
    } catch {
      // Session expired or invalid
    }
  }

  const stripe = getStripe()
  const appUrl = process.env.APP_URL || 'http://localhost:3000'

  const lineItems = invoice.lineItems.map((li) => ({
    price_data: {
      currency: 'usd',
      product_data: {
        name: li.name,
        description: li.description || undefined,
      },
      unit_amount: li.unitPriceCents,
    },
    quantity: li.quantity,
  }))

  if (invoice.taxCents > 0) {
    lineItems.push({
      price_data: {
        currency: 'usd',
        product_data: { name: 'Tax', description: undefined },
        unit_amount: invoice.taxCents,
      },
      quantity: 1,
    })
  }

  // Calculate platform fee
  const feePercent = org.platformFeePercent || 2.9
  const applicationFeeAmount = Math.round(invoice.totalCents * (feePercent / 100))

  const checkoutSession = await stripe.checkout.sessions.create(
    {
      mode: 'payment',
      line_items: lineItems,
      payment_intent_data: {
        application_fee_amount: applicationFeeAmount > 0 ? applicationFeeAmount : undefined,
        metadata: {
          invoiceId: invoice.id,
          organizationId: ctx.organizationId,
          invoiceNumber: invoice.invoiceNumber,
        },
      },
      success_url: `${appUrl}/pay/${invoice.id}?status=success`,
      cancel_url: `${appUrl}/portal/${token}/invoices/${invoice.id}`,
      metadata: {
        invoiceId: invoice.id,
        organizationId: ctx.organizationId,
      },
      customer_email: invoice.customer.email || undefined,
    },
    {
      stripeAccount: org.stripeConnectedAccountId,
    },
  )

  await db.invoice.update({
    where: { id: invoice.id },
    data: { stripeCheckoutSessionId: checkoutSession.id },
  })

  // Create pending payment record if payment intent is available
  if (checkoutSession.payment_intent) {
    const piId = typeof checkoutSession.payment_intent === 'string'
      ? checkoutSession.payment_intent
      : checkoutSession.payment_intent.id

    const existing = await db.payment.findUnique({ where: { stripePaymentIntent: piId } })
    if (!existing) {
      await db.payment.create({
        data: {
          organizationId: ctx.organizationId,
          invoiceId: invoice.id,
          stripePaymentIntent: piId,
          amountCents: invoice.totalCents,
          status: 'pending',
        },
      })
    }
  }

  await trackEvent({
    organizationId: ctx.organizationId,
    eventName: 'customer_portal_payment_initiated',
    entityType: 'invoice',
    entityId: invoice.id,
    metadataJson: { checkoutSessionId: checkoutSession.id },
  })

  return { success: true, checkoutUrl: checkoutSession.url! }
}
