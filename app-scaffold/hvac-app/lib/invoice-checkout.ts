import type Stripe from 'stripe'
import { trackEvent } from '@/lib/events'
import { reserveInvoicePaymentAttempt, saveInvoicePaymentProviderId, releaseInvoicePaymentLease, retireInvoicePaymentAttempt, type InvoicePaymentInvoice } from '@/lib/invoice-payment-attempt'

function parameters(invoice: InvoicePaymentInvoice, returnUrls: { success: string; cancel: string }): Stripe.Checkout.SessionCreateParams {
  if (invoice.outstandingCents !== invoice.totalCents) throw new Error('Adjusted invoice balance')
  const subtotal = invoice.lineItems.reduce((sum, item) => {
    if (!Number.isSafeInteger(item.quantity) || item.quantity <= 0 || !Number.isSafeInteger(item.unitPriceCents) || item.unitPriceCents < 0 ||
        !Number.isSafeInteger(item.quantity * item.unitPriceCents) || item.lineTotalCents !== item.quantity * item.unitPriceCents) throw new Error('Invalid invoice line')
    return sum + item.lineTotalCents
  }, 0)
  if (!invoice.lineItems.length || !Number.isSafeInteger(subtotal) || subtotal !== invoice.subtotalCents ||
      !Number.isSafeInteger(invoice.taxCents) || invoice.taxCents < 0 || subtotal + invoice.taxCents !== invoice.totalCents) throw new Error('Invalid invoice total')
  const percent = invoice.organization.platformFeePercent ?? 2.9
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) throw new Error('Invalid payment fee')
  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = invoice.lineItems.map(item => ({
    price_data: { currency: 'usd', product_data: { name: item.name, ...(item.description ? { description: item.description } : {}) }, unit_amount: item.unitPriceCents }, quantity: item.quantity,
  }))
  if (invoice.taxCents > 0) lineItems.push({ price_data: { currency: 'usd', product_data: { name: 'Tax' }, unit_amount: invoice.taxCents }, quantity: 1 })
  const fee = Math.round(invoice.totalCents * percent / 100)
  return {
    mode: 'payment', line_items: lineItems,
    payment_intent_data: { ...(fee > 0 ? { application_fee_amount: fee } : {}), metadata: { invoiceId: invoice.id, organizationId: invoice.organizationId, invoiceNumber: invoice.invoiceNumber } },
    success_url: returnUrls.success, cancel_url: returnUrls.cancel,
    metadata: { invoiceId: invoice.id, organizationId: invoice.organizationId },
    ...(invoice.customer.email ? { customer_email: invoice.customer.email } : {}),
  }
}

export async function startInvoiceCheckout(input: {
  stripe: Stripe; invoiceId: string; organizationId: string; customerId?: string; userId?: string
  returnUrls: { success: string; cancel: string }
}): Promise<{ success: true; checkoutUrl: string } | { success: false; error: string }> {
  for (let iteration = 0; iteration < 2; iteration++) {
    const reservation = await reserveInvoicePaymentAttempt({
      invoiceId: input.invoiceId, organizationId: input.organizationId, method: 'checkout',
      ...(input.customerId ? { customerPaymentCustomerId: input.customerId, invoiceWhere: { customerId: input.customerId, customer: { deletedAt: null } } } : {}),
      buildParams: invoice => parameters(invoice, input.returnUrls),
    })
    if (!reservation.success) return reservation
    const { attempt, invoice } = reservation
    if (invoice.outstandingCents !== invoice.totalCents) {
      await releaseInvoicePaymentLease(attempt)
      return { success: false, error: 'This invoice has an adjusted balance. Contact the business to arrange payment.' }
    }
    try {
      const options = { stripeAccount: attempt.connectedAccountId, timeout: 10_000, maxNetworkRetries: 0 }
      const session = attempt.providerId
        ? await input.stripe.checkout.sessions.retrieve(attempt.providerId, options)
        : await input.stripe.checkout.sessions.create(attempt.params as Stripe.Checkout.SessionCreateParams, { ...options, idempotencyKey: `invoice-payment:${attempt.id}` })
      if (!session.id || (attempt.providerId && session.id !== attempt.providerId) || session.mode !== 'payment' || session.currency !== 'usd' ||
          session.amount_total !== attempt.amountCents || session.metadata?.invoiceId !== attempt.invoiceId || session.metadata.organizationId !== attempt.organizationId) {
        await releaseInvoicePaymentLease(attempt)
        return { success: false, error: 'The previous payment could not be matched to this invoice. Contact the business before trying again.' }
      }
      const paymentIntentId = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id ?? null
      if (session.status === 'expired' && attempt.providerId) {
        if (!await retireInvoicePaymentAttempt(attempt, { paymentIntentId })) return { success: false, error: 'The previous payment changed. Please try again shortly.' }
        continue
      }
      if (session.status !== 'open' || session.payment_status !== 'unpaid' || !session.url) {
        await releaseInvoicePaymentLease(attempt)
        return { success: false, error: 'Your payment is processing. Please wait for confirmation before trying again.' }
      }
      if (!await saveInvoicePaymentProviderId(attempt, session.id, { paymentIntentId })) {
        await releaseInvoicePaymentLease(attempt)
        return { success: false, error: 'The payment session could not be saved. Please try again shortly; do not start another payment method.' }
      }
      try {
        await trackEvent({ organizationId: input.organizationId, userId: input.userId,
          eventName: input.customerId ? 'customer_portal_payment_initiated' : 'invoice_payment_initiated', entityType: 'invoice', entityId: input.invoiceId,
          metadataJson: { checkoutSessionId: session.id } })
      } catch { console.error('Payment setup activity could not be recorded') }
      return { success: true, checkoutUrl: session.url }
    } catch {
      await releaseInvoicePaymentLease(attempt)
      return { success: false, error: 'We could not confirm the payment session. Please try again shortly; do not start another payment method.' }
    }
  }
  return { success: false, error: 'The previous payment link expired. Please try again.' }
}
