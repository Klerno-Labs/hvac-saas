'use server'

import { requireMutationAccess } from '@/lib/mutation-access'
import { getStripe } from '@/lib/stripe'
import { startInvoiceCheckout } from '@/lib/invoice-checkout'

export async function createCheckoutSession(invoiceId: string): Promise<{ success: true; checkoutUrl: string } | { success: false; error: string }> {
  const access = await requireMutationAccess('editPricing')
  if (!access.authorized) return { success: false, error: access.error }
  let stripe: ReturnType<typeof getStripe>
  try { stripe = getStripe() } catch {
    return { success: false, error: 'Online payments are temporarily unavailable. Ask the owner to review payment setup.' }
  }
  const appUrl = process.env.APP_URL || 'http://localhost:3000'
  return startInvoiceCheckout({ stripe, invoiceId, organizationId: access.context.organizationId, userId: access.context.userId,
    returnUrls: { success: `${appUrl}/pay/${invoiceId}?status=success`, cancel: `${appUrl}/pay/${invoiceId}?status=cancelled` } })
}
