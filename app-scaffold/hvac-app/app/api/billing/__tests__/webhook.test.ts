import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('next/headers', () => ({
  headers: vi.fn(),
}))

vi.mock('@/lib/stripe', () => ({
  getStripe: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  db: {
    webhookEvent: {
      create: vi.fn(),
      update: vi.fn(),
    },
    organization: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}))

vi.mock('@/lib/billing-dunning', () => ({
  sendDunningEmail: vi.fn(),
}))

vi.mock('@/lib/session', () => ({
  requireAuth: vi.fn(),
}))

import { headers } from 'next/headers'
import { getStripe } from '@/lib/stripe'
import { db } from '@/lib/db'
import { sendDunningEmail } from '@/lib/billing-dunning'
import { requireAuth } from '@/lib/session'
import { POST as webhookPOST } from '@/app/api/billing/webhook/route'
import { POST as portalPOST } from '@/app/api/billing/portal/route'

// --- helpers ---

function makeWebhookRequest(body = '{}') {
  return new Request('http://localhost/api/billing/webhook', {
    method: 'POST',
    body,
  })
}

function makeSubscriptionEvent(type: string, status: string, customerId = 'cus_test') {
  return {
    id: `evt_sub_${status}`,
    type,
    data: {
      object: {
        id: 'sub_test',
        customer: customerId,
        status,
        current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400,
      },
    },
  }
}

function makeInvoiceEvent(type: string, customerId = 'cus_test', attempt_count = 1) {
  return {
    id: `evt_inv_${type}`,
    type,
    data: {
      object: {
        id: 'in_test',
        customer: customerId,
        attempt_count,
      },
    },
  }
}

// --- shared mock state ---

const mockStripe = {
  webhooks: { constructEvent: vi.fn() },
  customers: { create: vi.fn() },
  billingPortal: { sessions: { create: vi.fn() } },
}

const stubOrg = {
  id: 'org_1',
  name: 'Test HVAC',
  stripeCustomerId: 'cus_test',
  subscriptionStatus: 'ACTIVE',
  readOnlyAt: null,
}

beforeEach(() => {
  vi.clearAllMocks()

  vi.mocked(getStripe).mockReturnValue(mockStripe as never)
  vi.mocked(headers).mockResolvedValue({
    get: (k: string) => (k === 'stripe-signature' ? 'valid-sig' : null),
  } as never)

  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test'

  vi.mocked(db.webhookEvent.create).mockResolvedValue({} as never)
  vi.mocked(db.webhookEvent.update).mockResolvedValue({} as never)
  vi.mocked(db.organization.findFirst).mockResolvedValue(stubOrg as never)
  vi.mocked(db.organization.update).mockResolvedValue({} as never)
  vi.mocked(sendDunningEmail).mockResolvedValue(undefined)
})

// --- tests ---

describe('billing webhook', () => {
  it('(a) returns 400 and makes no DB write when signature is invalid', async () => {
    mockStripe.webhooks.constructEvent.mockImplementation(() => {
      throw new Error('No signatures found matching the expected signature for payload')
    })

    const res = await webhookPOST(makeWebhookRequest('bad'))

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body).toHaveProperty('error')
    expect(vi.mocked(db.webhookEvent.create)).not.toHaveBeenCalled()
  })

  it('(b) invoice.payment_failed sets PAST_DUE and calls sendDunningEmail once; replay of same stripeEventId does not resend', async () => {
    const event = makeInvoiceEvent('invoice.payment_failed')
    mockStripe.webhooks.constructEvent.mockReturnValue(event)

    // First delivery
    const res1 = await webhookPOST(makeWebhookRequest())
    expect(res1.status).toBe(200)

    expect(vi.mocked(db.organization.update)).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ subscriptionStatus: 'PAST_DUE' }),
      }),
    )
    expect(sendDunningEmail).toHaveBeenCalledTimes(1)
    expect(sendDunningEmail).toHaveBeenCalledWith('org_1', 1)

    // Replay: same stripeEventId → unique constraint fires
    const uniqueError = Object.assign(new Error('Unique constraint'), { code: 'P2002' })
    vi.mocked(db.webhookEvent.create).mockRejectedValueOnce(uniqueError)

    const res2 = await webhookPOST(makeWebhookRequest())
    expect(res2.status).toBe(200)
    // sendDunningEmail must NOT have been called again
    expect(sendDunningEmail).toHaveBeenCalledTimes(1)
  })

  it('(c) customer.subscription.deleted sets readOnlyAt', async () => {
    const event = makeSubscriptionEvent('customer.subscription.deleted', 'canceled')
    mockStripe.webhooks.constructEvent.mockReturnValue(event)

    await webhookPOST(makeWebhookRequest())

    expect(vi.mocked(db.organization.update)).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          subscriptionStatus: 'CANCELED',
          readOnlyAt: expect.any(Date),
        }),
      }),
    )
  })

  it('(d) customer.subscription.updated -> active clears readOnlyAt', async () => {
    const event = makeSubscriptionEvent('customer.subscription.updated', 'active')
    mockStripe.webhooks.constructEvent.mockReturnValue(event)

    await webhookPOST(makeWebhookRequest())

    expect(vi.mocked(db.organization.update)).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          subscriptionStatus: 'ACTIVE',
          readOnlyAt: null,
        }),
      }),
    )
  })
})

describe('billing portal', () => {
  it('(e) creates Stripe customer, persists stripeCustomerId, and returns { url }', async () => {
    vi.mocked(requireAuth).mockResolvedValue({
      organizationId: 'org_1',
      organization: { ...stubOrg, stripeCustomerId: null } as never,
      userId: 'user_1',
      user: {} as never,
      role: 'owner',
    } as never)

    mockStripe.customers.create.mockResolvedValue({ id: 'cus_new' })
    mockStripe.billingPortal.sessions.create.mockResolvedValue({
      url: 'https://billing.stripe.com/session_test',
    })

    const res = await portalPOST()
    const body = await res.json()

    expect(mockStripe.customers.create).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: { organizationId: 'org_1' } }),
    )
    expect(vi.mocked(db.organization.update)).toHaveBeenCalledWith(
      expect.objectContaining({ data: { stripeCustomerId: 'cus_new' } }),
    )
    expect(mockStripe.billingPortal.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({ customer: 'cus_new', return_url: expect.stringContaining('/settings/billing') }),
    )
    expect(body).toEqual({ url: 'https://billing.stripe.com/session_test' })
  })
})
