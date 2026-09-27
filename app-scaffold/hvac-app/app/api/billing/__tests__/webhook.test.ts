import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }))
import { captureException } from '@sentry/nextjs'

vi.mock('next/headers', () => ({
  headers: vi.fn(),
}))

vi.mock('@/lib/stripe', () => ({
  getStripe: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  db: {
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
    webhookEvent: {
      create: vi.fn(),
      deleteMany: vi.fn(),
      update: vi.fn(),
      findUnique: vi.fn(),
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
    livemode: false,
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
    livemode: false,
    data: {
      object: {
        id: 'in_test',
        subscription: 'sub_test',
        customer: customerId,
        attempt_count,
      },
    },
  }
}

// --- shared mock state ---

const mockStripe = {
  webhooks: { constructEvent: vi.fn() },
  subscriptions: { retrieve: vi.fn() },
  customers: { create: vi.fn() },
  billingPortal: { sessions: { create: vi.fn() } },
}

const stubOrg = {
  id: 'org_1',
  name: 'Test HVAC',
  stripeCustomerId: 'cus_test',
  stripeSubscriptionId: 'sub_test' as string | null,
  updatedAt: new Date('2026-09-27T12:00:00Z'),
  subscriptionStatus: 'ACTIVE',
  readOnlyAt: null,
}

function givenOrganization(org: typeof stubOrg | null) {
  vi.mocked(db.organization.findFirst).mockResolvedValue(org as never)
  vi.mocked(db.organization.findUnique).mockImplementation(({ where }) => {
    if (!org) return Promise.resolve(null) as never
    const matches = where.id ? where.id === org.id
      : where.stripeCustomerId ? where.stripeCustomerId === org.stripeCustomerId
      : where.stripeSubscriptionId === org.stripeSubscriptionId
    return Promise.resolve(matches ? org : null) as never
  })
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(db.$transaction).mockImplementation(async (fn: any) => fn(db))
  vi.mocked(db.webhookEvent.findUnique).mockResolvedValue({processedAt: new Date()} as never)

  vi.mocked(getStripe).mockReturnValue(mockStripe as never)
  mockStripe.subscriptions.retrieve.mockImplementation(async () => {
    const event = mockStripe.webhooks.constructEvent.mock.results.at(-1)?.value
    return event.type.startsWith('customer.subscription.') ? event.data.object : {id: 'sub_test', customer: 'cus_test', status: event.type === 'invoice.payment_failed' ? 'past_due' : 'active'}
  })
  vi.mocked(headers).mockResolvedValue({
    get: (k: string) => (k === 'stripe-signature' ? 'valid-sig' : null),
  } as never)

  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test'
  process.env.STRIPE_CONNECT_WEBHOOK_SECRET = 'whsec_connect_test'
  process.env.STRIPE_SECRET_KEY = 'sk_test_fixture'

  vi.mocked(db.webhookEvent.create).mockResolvedValue({} as never)
  vi.mocked(db.webhookEvent.update).mockResolvedValue({} as never)
  givenOrganization(stubOrg)
  vi.mocked(db.organization.update).mockResolvedValue({} as never)
  vi.mocked(sendDunningEmail).mockResolvedValue(undefined)
  vi.stubEnv('STRIPE_STARTER_PRICE_ID', 'price_fieldclose_starter')
  vi.stubEnv('STRIPE_PRO_PRICE_ID', 'price_fieldclose_pro')
})
afterEach(() => vi.unstubAllEnvs())

// --- tests ---

describe('billing webhook', () => {
  it('rejects connected-account subscription events before retrieving or changing platform billing', async () => {
    mockStripe.webhooks.constructEvent.mockReturnValue({
      ...makeSubscriptionEvent('customer.subscription.updated', 'active'), account: 'acct_other',
    })
    expect((await webhookPOST(makeWebhookRequest())).status).toBe(400)
    expect(mockStripe.subscriptions.retrieve).not.toHaveBeenCalled()
    expect(db.$transaction).not.toHaveBeenCalled()
  })

  it('acknowledges a signed event in the opposite Stripe mode without billing writes', async () => {
    mockStripe.webhooks.constructEvent.mockReturnValue({
      ...makeSubscriptionEvent('customer.subscription.updated', 'active'), livemode: true,
    })
    expect((await webhookPOST(makeWebhookRequest())).status).toBe(200)
    expect(mockStripe.subscriptions.retrieve).not.toHaveBeenCalled()
    expect(db.$transaction).not.toHaveBeenCalled()
  })

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
      {idempotencyKey: 'fieldclose-customer-org_1'},
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


describe('billing security and recovery', () => {
  it('denies non-owners access to the billing portal without contacting Stripe', async () => {
    vi.mocked(requireAuth).mockResolvedValue({organizationId: 'org_1', organization: stubOrg, role: 'tech'} as never)
    expect((await portalPOST()).status).toBe(403)
    expect(mockStripe.billingPortal.sessions.create).not.toHaveBeenCalled()
  })
  it('returns 500 on a database failure so Stripe retries', async () => {
    mockStripe.webhooks.constructEvent.mockReturnValue(makeSubscriptionEvent('customer.subscription.updated', 'active'))
    vi.mocked(db.organization.update).mockRejectedValueOnce(new Error('database temporarily unavailable'))
    expect((await webhookPOST(makeWebhookRequest())).status).toBe(500)
    expect(db.webhookEvent.update).not.toHaveBeenCalled()
  })
  it('never grants an active subscription for an unknown Stripe status', async () => {
    mockStripe.webhooks.constructEvent.mockReturnValue(makeSubscriptionEvent('customer.subscription.updated', 'paused'))
    expect((await webhookPOST(makeWebhookRequest())).status).toBe(200)
    expect(db.organization.update).toHaveBeenCalledWith(expect.objectContaining({data: expect.objectContaining({subscriptionStatus: 'INCOMPLETE'})}))
  })
  it('normalizes metadata plan IDs to the database enum', async () => {
    const event = makeSubscriptionEvent('customer.subscription.updated', 'active')
    Object.assign(event.data.object, {metadata: {planId: 'pro', organizationId: 'org_1'}})
    mockStripe.webhooks.constructEvent.mockReturnValue(event)
    await webhookPOST(makeWebhookRequest())
    expect(db.organization.update).toHaveBeenCalledWith(expect.objectContaining({data: expect.objectContaining({plan: 'PRO'})}))
  })
})


describe('billing event ordering', () => {
  it('does not reactivate a canceled subscription from an old payment-success event', async () => {
    mockStripe.webhooks.constructEvent.mockReturnValue(makeInvoiceEvent('invoice.payment_succeeded'))
    mockStripe.subscriptions.retrieve.mockResolvedValue({id:'sub_test',customer:'cus_test',status:'canceled'})
    expect((await webhookPOST(makeWebhookRequest())).status).toBe(200)
    expect(db.organization.update).toHaveBeenCalledWith(expect.objectContaining({data: expect.objectContaining({subscriptionStatus:'CANCELED'})}))
  })
  it('does not grant subscription access for a one-off invoice', async () => {
    const event = makeInvoiceEvent('invoice.payment_succeeded')
    Object.assign(event.data.object, {subscription:null})
    mockStripe.webhooks.constructEvent.mockReturnValue(event)
    expect((await webhookPOST(makeWebhookRequest())).status).toBe(200)
    expect(db.organization.update).not.toHaveBeenCalled()
  })
})

function fieldCloseSubscription(planId = 'starter') {
  const event = makeSubscriptionEvent('customer.subscription.created', 'active')
  return { ...event, data: { object: { ...event.data.object,
    metadata: { organizationId: 'org_1', planId },
    items: { data: [{ price: { id: `price_fieldclose_${planId}` }, quantity: 1 }] },
  } } }
}

describe('shared-platform billing association', () => {
  function expectNoBillingWrite() {
    expect(db.$transaction).not.toHaveBeenCalled()
    expect(db.webhookEvent.create).not.toHaveBeenCalled()
    expect(db.organization.update).not.toHaveBeenCalled()
    expect(sendDunningEmail).not.toHaveBeenCalled()
  }

  it.each(['customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted', 'invoice.payment_failed', 'invoice.payment_succeeded'])('ignores unrelated %s without retrieving a foreign subscription or writing event records', async type => {
    const event = type.startsWith('invoice.') ? makeInvoiceEvent(type, 'cus_other_app') : makeSubscriptionEvent(type, 'active', 'cus_other_app')
    mockStripe.webhooks.constructEvent.mockReturnValue(event)
    givenOrganization(null)
    expect(await (await webhookPOST(makeWebhookRequest())).json()).toEqual({ received: true, ignored: true })
    expect(mockStripe.subscriptions.retrieve).not.toHaveBeenCalled()
    expectNoBillingWrite()
  })

  it('does not adopt an unrelated subscription merely because another app reused the customer', async () => {
    givenOrganization({ ...stubOrg, stripeSubscriptionId: null })
    mockStripe.webhooks.constructEvent.mockReturnValue(makeSubscriptionEvent('customer.subscription.created', 'active'))
    expect(await (await webhookPOST(makeWebhookRequest())).json()).toEqual({ received: true, ignored: true })
    expectNoBillingWrite()
  })

  it('ignores a foreign-priced subscription with foreign organization metadata on the same customer', async () => {
    givenOrganization({ ...stubOrg, stripeSubscriptionId: null })
    const event = fieldCloseSubscription()
    event.data.object.metadata.organizationId = 'foreign_app_org'
    event.data.object.items.data[0].price.id = 'price_foreign_app'
    mockStripe.webhooks.constructEvent.mockReturnValue(event)
    expect(await (await webhookPOST(makeWebhookRequest())).json()).toEqual({ received: true, ignored: true })
    expectNoBillingWrite()
  })

  it.each(['bound-subscription', 'fieldclose-price', 'known-organization'])('retries conflicting metadata when %s establishes FieldClose association', async reason => {
    givenOrganization({ ...stubOrg, stripeSubscriptionId: reason === 'bound-subscription' ? 'sub_test' : null })
    const event = fieldCloseSubscription()
    event.data.object.metadata.organizationId = 'another_org'
    if (reason !== 'fieldclose-price') event.data.object.items.data[0].price.id = 'price_foreign_app'
    if (reason === 'known-organization') {
      vi.mocked(db.organization.findUnique).mockImplementation(({ where }) => {
        if (where.stripeCustomerId === 'cus_test') return Promise.resolve({ ...stubOrg, stripeSubscriptionId: null }) as never
        if (where.id === 'another_org') return Promise.resolve({ ...stubOrg, id: 'another_org', stripeCustomerId: 'cus_another' }) as never
        return Promise.resolve(null) as never
      })
    }
    mockStripe.webhooks.constructEvent.mockReturnValue(event)
    expect((await webhookPOST(makeWebhookRequest())).status).toBe(500)
    expectNoBillingWrite()
  })

  it('resolves the exact subscription before a competing customer association', async () => {
    const event = fieldCloseSubscription()
    event.data.object.customer = 'cus_other'
    mockStripe.webhooks.constructEvent.mockReturnValue(event)
    expect((await webhookPOST(makeWebhookRequest())).status).toBe(500)
    expect(db.organization.findUnique).toHaveBeenCalledExactlyOnceWith({ where: { stripeSubscriptionId: 'sub_test' } })
    expect(mockStripe.subscriptions.retrieve).not.toHaveBeenCalled()
    expectNoBillingWrite()
  })

  it.each(['starter', 'pro'])('binds an initial %s subscription only with matching customer, organization, plan, and price', async planId => {
    givenOrganization({ ...stubOrg, stripeSubscriptionId: null })
    mockStripe.webhooks.constructEvent.mockReturnValue(fieldCloseSubscription(planId))
    expect((await webhookPOST(makeWebhookRequest())).status).toBe(200)
    expect(db.$queryRaw).toHaveBeenCalled()
    expect(db.organization.update).toHaveBeenCalledWith({ where: { id: 'org_1' }, data: expect.objectContaining({ stripeSubscriptionId: 'sub_test', plan: planId.toUpperCase(), subscriptionStatus: 'ACTIVE' }) })
  })

  it.each(['wrong-price', 'missing-price', 'wrong-quantity', 'extra-item', 'unknown-plan'])('retries an owned initial subscription with %s instead of granting access', async condition => {
    givenOrganization({ ...stubOrg, stripeSubscriptionId: null })
    const event = fieldCloseSubscription()
    if (condition === 'wrong-price') event.data.object.items.data[0].price.id = 'price_other_app'
    if (condition === 'missing-price') vi.stubEnv('STRIPE_STARTER_PRICE_ID', '')
    if (condition === 'wrong-quantity') event.data.object.items.data[0].quantity = 2
    if (condition === 'extra-item') event.data.object.items.data.push({ price: { id: 'price_other_app' }, quantity: 1 })
    if (condition === 'unknown-plan') event.data.object.metadata.planId = 'enterprise'
    mockStripe.webhooks.constructEvent.mockReturnValue(event)
    expect((await webhookPOST(makeWebhookRequest())).status).toBe(500)
    expectNoBillingWrite()
  })

  it('does not discard a FieldClose-priced subscription whose organization is temporarily missing', async () => {
    givenOrganization(null)
    mockStripe.webhooks.constructEvent.mockReturnValue(fieldCloseSubscription())
    expect((await webhookPOST(makeWebhookRequest())).status).toBe(500)
    expectNoBillingWrite()
  })

  it.each(['known-customer', 'unknown-customer'])('retries a FieldClose-priced subscription with missing organization metadata and %s', async association => {
    givenOrganization(association === 'known-customer' ? { ...stubOrg, stripeSubscriptionId: null } : null)
    const event = fieldCloseSubscription()
    event.data.object.metadata.organizationId = ''
    mockStripe.webhooks.constructEvent.mockReturnValue(event)
    expect((await webhookPOST(makeWebhookRequest())).status).toBe(500)
    expectNoBillingWrite()
  })

  it('does not mistake another app’s generic organization/plan metadata for FieldClose ownership', async () => {
    givenOrganization(null)
    const event = fieldCloseSubscription()
    event.data.object.metadata.organizationId = 'other_app_org'
    event.data.object.items.data[0].price.id = 'price_other_app'
    mockStripe.webhooks.constructEvent.mockReturnValue(event)
    expect(await (await webhookPOST(makeWebhookRequest())).json()).toEqual({ received: true, ignored: true })
    expectNoBillingWrite()
  })

  it('retries when an event or retrieved subscription conflicts with our stored customer', async () => {
    mockStripe.webhooks.constructEvent.mockReturnValue(fieldCloseSubscription())
    mockStripe.subscriptions.retrieve.mockResolvedValue({ ...fieldCloseSubscription().data.object, customer: 'cus_wrong' })
    expect((await webhookPOST(makeWebhookRequest())).status).toBe(500)
    expectNoBillingWrite()
  })

  it('retains provider retries for an owned subscription', async () => {
    mockStripe.webhooks.constructEvent.mockReturnValue(makeSubscriptionEvent('customer.subscription.updated', 'active'))
    mockStripe.subscriptions.retrieve.mockRejectedValue(new Error('Provider unavailable'))
    expect((await webhookPOST(makeWebhookRequest())).status).toBe(500)
    expect(captureException).toHaveBeenCalledOnce()
    expectNoBillingWrite()
  })

  it('reports a caught billing notification failure without replaying the committed billing event', async () => {
    mockStripe.webhooks.constructEvent.mockReturnValue(makeInvoiceEvent('invoice.payment_failed'))
    const failure = new Error('Notification unavailable')
    vi.mocked(sendDunningEmail).mockRejectedValue(failure)
    expect((await webhookPOST(makeWebhookRequest())).status).toBe(200)
    expect(db.webhookEvent.update).toHaveBeenCalled()
    expect(captureException).toHaveBeenCalledExactlyOnceWith(failure)
  })

  it('permits a verified replacement only after the previous subscription is canceled', async () => {
    givenOrganization({ ...stubOrg, stripeSubscriptionId: 'sub_previous', subscriptionStatus: 'CANCELED' })
    mockStripe.webhooks.constructEvent.mockReturnValue(fieldCloseSubscription())
    expect((await webhookPOST(makeWebhookRequest())).status).toBe(200)
    expect(db.organization.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ stripeSubscriptionId: 'sub_test', subscriptionStatus: 'ACTIVE' }) }))
  })

  it('cannot replace a current subscription from a delayed older event', async () => {
    givenOrganization({ ...stubOrg, stripeSubscriptionId: 'sub_newer' })
    mockStripe.webhooks.constructEvent.mockReturnValue(fieldCloseSubscription())
    expect(await (await webhookPOST(makeWebhookRequest())).json()).toEqual({ received: true, ignored: true })
    expectNoBillingWrite()
  })

  it('retries a changed subscription association inside the transaction', async () => {
    givenOrganization({ ...stubOrg, stripeSubscriptionId: null })
    vi.mocked(db.organization.findFirst).mockResolvedValue({ ...stubOrg, stripeSubscriptionId: 'sub_concurrent' } as never)
    mockStripe.webhooks.constructEvent.mockReturnValue(fieldCloseSubscription())
    expect((await webhookPOST(makeWebhookRequest())).status).toBe(500)
    expect(db.$queryRaw).toHaveBeenCalled()
    expect(db.organization.update).not.toHaveBeenCalled()
  })
})
