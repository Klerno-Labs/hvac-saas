import { describe, it, expect, beforeEach, vi } from 'vitest'
import { resetRateLimitStore, RL } from '@/lib/rate-limit'

vi.mock('next/headers', () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}))

vi.mock('@/lib/portal', () => ({
  validatePortalToken: vi.fn(),
}))

vi.mock('@/lib/events', () => ({
  trackEvent: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/stripe', () => ({
  getStripe: vi.fn(),
}))

vi.mock('@/lib/invoice-payment-attempt', () => ({
  reserveInvoicePaymentAttempt: vi.fn(),
  saveInvoicePaymentProviderId: vi.fn().mockResolvedValue(true),
  releaseInvoicePaymentLease: vi.fn().mockResolvedValue(true),
  retireInvoicePaymentAttempt: vi.fn(),
}))

const { validatePortalToken } = await import('@/lib/portal')
const { getStripe } = await import('@/lib/stripe')
const { reserveInvoicePaymentAttempt } = await import('@/lib/invoice-payment-attempt')
const { createPortalCheckoutSession } = await import(
  '@/app/portal/[token]/invoices/[invoiceId]/payment-action'
)

describe('public-pay (createPortalCheckoutSession) rate limit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetRateLimitStore()

    ;(validatePortalToken as ReturnType<typeof vi.fn>).mockResolvedValue({
      organizationId: 'org-1',
      customerId: 'cust-1',
      customerName: 'Jane Doe',
      organizationName: 'Acme HVAC',
    })
    vi.mocked(reserveInvoicePaymentAttempt).mockResolvedValue({
      success: true,
      invoice: { totalCents: 5000, outstandingCents: 5000 },
      attempt: { id: 'attempt-1', invoiceId: 'inv-1', organizationId: 'org-1',
        connectedAccountId: 'acct_1', amountCents: 5000, params: {}, providerId: null },
    } as never)

    const sessionsCreate = vi.fn().mockResolvedValue({
      id: 'cs_test_1',
      url: 'https://checkout.example.com/cs/test',
      payment_intent: 'pi_test_1',
      mode: 'payment', currency: 'usd', amount_total: 5000, status: 'open', payment_status: 'unpaid',
      metadata: { invoiceId: 'inv-1', organizationId: 'org-1' },
    })
    ;(getStripe as ReturnType<typeof vi.fn>).mockReturnValue({
      checkout: { sessions: { create: sessionsCreate, retrieve: vi.fn() } },
    })
  })

  it('lets the first RL.publicPay.max requests reach Stripe, then denies without touching Stripe or token verification', async () => {
    const token = 'portal-token-abc'
    const max = RL.publicPay.max

    for (let i = 0; i < max; i++) {
      const res = await createPortalCheckoutSession(token, 'inv-1')
      expect(res).toEqual({ success: true, checkoutUrl: 'https://checkout.example.com/cs/test' })
    }

    const sessionsCreate = (getStripe as ReturnType<typeof vi.fn>).mock.results[0].value.checkout.sessions.create
    expect(sessionsCreate).toHaveBeenCalledTimes(max)
    expect(validatePortalToken).toHaveBeenCalledTimes(max)

    const denied = await createPortalCheckoutSession(token, 'inv-1')
    expect(denied.success).toBe(false)
    if (!denied.success) {
      expect(denied.error).toMatch(/too many attempts/i)
      expect(denied.error).not.toMatch(/inv-1|portal-token-abc/i)
    }

    expect(sessionsCreate).toHaveBeenCalledTimes(max)
    expect(validatePortalToken).toHaveBeenCalledTimes(max)
  })

  it('uses a per-token bucket so a different token is not blocked', async () => {
    const max = RL.publicPay.max
    for (let i = 0; i < max; i++) {
      const res = await createPortalCheckoutSession('token-A', 'inv-1')
      expect(res.success).toBe(true)
    }

    const other = await createPortalCheckoutSession('token-B', 'inv-1')
    expect(other.success).toBe(true)
  })
  it('uses the durable invoice attempt as the stable Stripe idempotency key', async () => {
    await createPortalCheckoutSession('token-A', 'inv-1')
    expect(getStripe().checkout.sessions.create).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({idempotencyKey: 'invoice-payment:attempt-1', stripeAccount: 'acct_1'}))
  })
  it.each(['complete', 'unavailable'])('does not create another checkout when the previous session is %s', async state => {
    vi.mocked(reserveInvoicePaymentAttempt).mockResolvedValue({ success: true, invoice: { totalCents: 5000, outstandingCents: 5000 }, attempt: { id: 'attempt-1', invoiceId: 'inv-1', organizationId: 'org-1', connectedAccountId: 'acct_1', amountCents: 5000, params: {}, providerId: 'cs_old' } } as never)
    const stripe = getStripe()
    if (state === 'complete') vi.mocked(stripe.checkout.sessions.retrieve).mockResolvedValue({status:'complete'} as never)
    else vi.mocked(stripe.checkout.sessions.retrieve).mockRejectedValue(new Error('network failed'))
    expect((await createPortalCheckoutSession('token-A','inv-1')).success).toBe(false)
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled()
  })

})
