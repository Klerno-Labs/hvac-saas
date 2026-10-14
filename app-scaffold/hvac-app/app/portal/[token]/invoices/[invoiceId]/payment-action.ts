'use server'

import { getStripe } from '@/lib/stripe'
import { validatePortalToken } from '@/lib/portal'
import { headers } from 'next/headers'
import { limit, RL, extractIp } from '@/lib/rate-limit'
import { assertRateLimit, RateLimitError } from '@/lib/rate-limit/respond'
import { startInvoiceCheckout } from '@/lib/invoice-checkout'

export async function createPortalCheckoutSession(token: string, invoiceId: string): Promise<{ success: true; checkoutUrl: string } | { success: false; error: string }> {
  const guard = await limit({ preset: RL.publicPay, ip: extractIp(await headers()), id: token })
  try { assertRateLimit(guard) } catch (error) {
    if (error instanceof RateLimitError) return { success: false, error: `Too many attempts. Try again in ${error.retryAfterSeconds}s.` }
    throw error
  }
  const context = await validatePortalToken(token)
  if (!context) return { success: false, error: 'Invalid or expired portal link' }
  let stripe: ReturnType<typeof getStripe>
  try { stripe = getStripe() } catch {
    return { success: false, error: 'Online payment is temporarily unavailable. Contact the business to arrange payment.' }
  }
  const appUrl = process.env.APP_URL || 'http://localhost:3000'
  return startInvoiceCheckout({ stripe, invoiceId, organizationId: context.organizationId, customerId: context.customerId,
    returnUrls: { success: `${appUrl}/portal/${token}/invoices/${invoiceId}?status=processing`, cancel: `${appUrl}/portal/${token}/invoices/${invoiceId}` } })
}
