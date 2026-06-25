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

vi.mock('@/lib/db', () => ({
  db: {
    organization: { findUnique: vi.fn() },
    invoice: { findFirst: vi.fn(), update: vi.fn() },
    payment: { findUnique: vi.fn(), create: vi.fn() },
  },
}))

const { validatePortalToken } = await import('@/lib/portal')
const { getStripe } = await import('@/lib/stripe')
const { db } = await import('@/lib/db')
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
    ;(db.organization.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'org-1',
      stripeConnectedAccountId: 'acct_1',
      stripeChargesEnabled: true,
      platformFeePercent: 2.9,
    })
    ;(db.invoice.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'inv-1',
      invoiceNumber: 'INV-1',
      status: 'sent',
      totalCents: 5000,
      taxCents: 0,
      customer: { email: null },
      lineItems: [],
      stripeCheckoutSessionId: null,
    })
    ;(db.invoice.update as ReturnType<typeof vi.fn>).mockResolvedValue({})
    ;(db.payment.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null)
    ;(db.payment.create as ReturnType<typeof vi.fn>).mockResolvedValue({})

    const sessionsCreate = vi.fn().mockResolvedValue({
      id: 'cs_test_1',
      url: 'https://checkout.example.com/cs/test',
      payment_intent: 'pi_test_1',
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
})
