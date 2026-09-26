import { db } from '@/lib/db'

export type ConfirmedPayment = {
  invoiceId: string
  organizationId: string
  connectedAccountId: string | undefined
  paymentIntentId: string
  amountCents: number
  currency: string
  method: string
}

/** Only called after a signed Stripe event confirms settlement. Row-level lock
 * serializes checkout and Terminal deliveries for the same invoice. */
export async function reconcileConfirmedPayment(payment: ConfirmedPayment): Promise<void> {
  if (!Number.isSafeInteger(payment.amountCents) || payment.amountCents <= 0 || payment.currency !== 'usd') {
    throw new Error('Invalid settled payment amount or currency')
  }
  await db.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "Invoice" WHERE id = ${payment.invoiceId} FOR UPDATE`
    const invoice = await tx.invoice.findUnique({where: {id: payment.invoiceId}, include: {organization: true}})
    if (!invoice || invoice.organizationId !== payment.organizationId ||
        !payment.connectedAccountId || invoice.organization.stripeConnectedAccountId !== payment.connectedAccountId) {
      throw new Error('Payment does not match invoice organization and Stripe account')
    }
    const existing = await tx.payment.findUnique({where: {stripePaymentIntent: payment.paymentIntentId}})
    if (existing && (existing.invoiceId !== invoice.id || existing.organizationId !== invoice.organizationId)) {
      throw new Error('Payment intent is linked to another invoice')
    }
    if (existing?.status === 'succeeded') return
    if (invoice.status === 'void' || invoice.status === 'draft' || invoice.status === 'paid' ||
        payment.amountCents !== invoice.outstandingCents) {
      throw new Error('Settled payment does not match the collectible invoice balance; reconciliation required')
    }
    const paidAt = new Date()
    await tx.payment.upsert({
      where: {stripePaymentIntent: payment.paymentIntentId},
      create: {organizationId: invoice.organizationId, invoiceId: invoice.id, stripePaymentIntent: payment.paymentIntentId,
        amountCents: payment.amountCents, currency: payment.currency, method: payment.method, status: 'succeeded', paidAt},
      update: {amountCents: payment.amountCents, currency: payment.currency, status: 'succeeded', paidAt},
    })
    await tx.invoice.update({where: {id: invoice.id}, data: {status: 'paid', outstandingCents: 0, paidAt}})
    await tx.collectionAttempt.updateMany({where: {invoiceId: invoice.id, status: 'created'}, data: {status: 'skipped'}})
    await tx.auditLog.create({data: {organizationId: invoice.organizationId, actorEmail: 'stripe-webhook', eventType: 'payment.recorded', targetType: 'invoice', targetId: invoice.id, metadata: {amountCents: payment.amountCents, currency: payment.currency, method: payment.method}}})
  })
}
