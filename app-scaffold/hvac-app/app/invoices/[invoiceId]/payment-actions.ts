'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { trackEvent } from '@/lib/events'
import { logAudit } from '@/lib/audit'
import { getStripe } from '@/lib/stripe'

type CreateCheckoutResult =
  | { success: true; checkoutUrl: string }
  | { success: false; error: string }

export async function createCheckoutSession(invoiceId: string): Promise<CreateCheckoutResult> {
  const session = await auth()
  if (!session?.user?.id) {
    return { success: false, error: 'You must be logged in' }
  }

  const userId = session.user.id

  const membership = await db.organizationMember.findFirst({
    where: { userId },
  })
  if (!membership) {
    return { success: false, error: 'You must belong to an organization' }
  }

  const organizationId = membership.organizationId

  const org = await db.organization.findUnique({ where: { id: organizationId } })
  if (!org?.stripeConnectedAccountId || !org.stripeChargesEnabled) {
    return { success: false, error: 'Stripe is not connected or charges are not enabled. Go to Settings to connect Stripe.' }
  }

  const invoice = await db.invoice.findFirst({
    where: { id: invoiceId, organizationId },
    include: { customer: true, lineItems: { orderBy: { sortOrder: 'asc' } } },
  })
  if (!invoice) {
    return { success: false, error: 'Invoice not found in your organization' }
  }

  if (invoice.status === 'paid' || invoice.status === 'void') {
    return { success: false, error: `Invoice is already ${invoice.status}` }
  }

  if (invoice.totalCents <= 0) {
    return { success: false, error: 'Invoice total must be greater than zero' }
  }

  // If a checkout session already exists and is still usable, return it
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
      // Session expired or invalid, create a new one
    }
  }

  const stripe = getStripe()
  const appUrl = process.env.APP_URL || 'http://localhost:3000'

  // Build line items for Checkout
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

  // Add tax as a separate line item if present
  if (invoice.taxCents > 0) {
    lineItems.push({
      price_data: {
        currency: 'usd',
        product_data: {
          name: 'Tax',
          description: undefined,
        },
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
          organizationId,
          invoiceNumber: invoice.invoiceNumber,
        },
      },
      success_url: `${appUrl}/pay/${invoice.id}?status=success`,
      cancel_url: `${appUrl}/pay/${invoice.id}?status=cancelled`,
      metadata: {
        invoiceId: invoice.id,
        organizationId,
      },
      customer_email: invoice.customer.email || undefined,
    },
    {
      stripeAccount: org.stripeConnectedAccountId,
    },
  )

  // Store checkout session ID on invoice
  await db.invoice.update({
    where: { id: invoice.id },
    data: { stripeCheckoutSessionId: checkoutSession.id },
  })

  // Create local payment record in pending state
  await db.payment.create({
    data: {
      organizationId,
      invoiceId: invoice.id,
      stripePaymentIntent: checkoutSession.payment_intent as string | null,
      amountCents: invoice.totalCents,
      status: 'pending',
    },
  })

  await trackEvent({
    organizationId,
    userId,
    eventName: 'invoice_payment_initiated',
    entityType: 'invoice',
    entityId: invoice.id,
    metadataJson: { checkoutSessionId: checkoutSession.id },
  })

  await logAudit({
    organizationId,
    actorId: userId,
    actorEmail: session.user.email ?? undefined,
    eventType: 'payment_initiated',
    targetType: 'invoice',
    targetId: invoice.id,
    metadata: {
      invoiceNumber: invoice.invoiceNumber,
      amountCents: invoice.totalCents,
      checkoutSessionId: checkoutSession.id,
    },
  })

  return { success: true, checkoutUrl: checkoutSession.url! }
}
