import { describe, it, expect, vi, beforeEach } from 'vitest'

// vi.mock factories are hoisted above imports, so the mock fns must be created
// inside vi.hoisted() to be referenceable from the factories.
const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  portalCreate: vi.fn(),
  createCheckout: vi.fn(),
  findUnique: vi.fn(),
}))

vi.mock('@/lib/require-admin', () => ({ requireAdmin: mocks.requireAdmin }))
vi.mock('@/lib/stripe', () => ({
  getStripe: () => ({ billingPortal: { sessions: { create: mocks.portalCreate } } }),
}))
vi.mock('@/lib/billing', () => ({ createSubscriptionCheckout: mocks.createCheckout }))
vi.mock('@/lib/db', () => ({ db: { organization: { findUnique: mocks.findUnique } } }))

import { POST } from '@/app/api/billing/portal/route'

beforeEach(() => {
  mocks.requireAdmin.mockReset()
  mocks.portalCreate.mockReset()
  mocks.createCheckout.mockReset()
  mocks.findUnique.mockReset()
})

describe('POST /api/billing/portal', () => {
  it('rejects non-owners with 403 and no url', async () => {
    mocks.requireAdmin.mockResolvedValue({ authorized: false, error: 'Only owners can do this' })

    const res = await POST()
    const body = await res.json()

    expect(res.status).toBe(403)
    expect(body.url).toBeUndefined()
    expect(body.error).toBe('Only owners can do this')
    expect(mocks.findUnique).not.toHaveBeenCalled()
  })

  it('returns a Stripe portal url for an existing customer (no customer id leaks)', async () => {
    mocks.requireAdmin.mockResolvedValue({
      authorized: true,
      context: { userId: 'u1', userEmail: 'o@x.com', organizationId: 'org_1', role: 'owner' },
    })
    mocks.findUnique.mockResolvedValue({ stripeCustomerId: 'cus_abc', plan: 'STARTER' })
    mocks.portalCreate.mockResolvedValue({ url: 'https://billing.stripe.com/p_sess_123' })

    const res = await POST()
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({ url: 'https://billing.stripe.com/p_sess_123' })
    // Only the url is exposed — never the customer id or return_url internals.
    expect(JSON.stringify(body)).not.toContain('cus_abc')
    expect(mocks.portalCreate).toHaveBeenCalledWith(
      expect.objectContaining({ customer: 'cus_abc', return_url: expect.stringContaining('/settings/billing') }),
    )
    expect(mocks.createCheckout).not.toHaveBeenCalled()
  })

  it('falls back to checkout for an org without a Stripe customer', async () => {
    mocks.requireAdmin.mockResolvedValue({
      authorized: true,
      context: { userId: 'u1', userEmail: 'o@x.com', organizationId: 'org_1', role: 'owner' },
    })
    mocks.findUnique.mockResolvedValue({ stripeCustomerId: null, plan: 'PRO' })
    mocks.createCheckout.mockResolvedValue({ url: 'https://checkout.stripe.com/c_sess_456' })

    const res = await POST()
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({ url: 'https://checkout.stripe.com/c_sess_456' })
    expect(mocks.createCheckout).toHaveBeenCalledWith(expect.objectContaining({ planId: 'pro' }))
    expect(mocks.portalCreate).not.toHaveBeenCalled()
  })

  it('returns 500 with a friendly message when Stripe throws', async () => {
    mocks.requireAdmin.mockResolvedValue({
      authorized: true,
      context: { userId: 'u1', userEmail: 'o@x.com', organizationId: 'org_1', role: 'owner' },
    })
    mocks.findUnique.mockResolvedValue({ stripeCustomerId: 'cus_abc', plan: 'STARTER' })
    mocks.portalCreate.mockRejectedValue(new Error('stripe down'))

    const res = await POST()
    const body = await res.json()

    expect(res.status).toBe(500)
    expect(body.url).toBeUndefined()
    expect(body.error).toMatch(/could not open billing portal/i)
  })
})
