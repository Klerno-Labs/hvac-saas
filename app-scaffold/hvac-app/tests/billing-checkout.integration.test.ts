import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import type Stripe from 'stripe'

const provider = vi.hoisted(() => {
  vi.stubEnv('STRIPE_STARTER_PRICE_ID', 'price_starter_fixture')
  vi.stubEnv('STRIPE_PRO_PRICE_ID', 'price_pro_fixture')
  vi.stubEnv('APP_URL', 'https://billing.example.test')
  return { getStripe: vi.fn(), customer: vi.fn(), create: vi.fn(), list: vi.fn(), subscriptions: vi.fn(), retrieve: vi.fn(), expire: vi.fn(), portal: vi.fn() }
})
vi.mock('@/lib/stripe', () => ({ getStripe: provider.getStripe }))
if (!process.env.TEST_DATABASE_URL || !new URL(process.env.TEST_DATABASE_URL).pathname.endsWith('_test')) throw new Error('Dedicated TEST_DATABASE_URL required')
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL
const { db } = await import('@/lib/db')
const { createSubscriptionCheckout, PLANS } = await import('@/lib/billing')
const orgs: string[] = []
type CheckoutFixture = Pick<Stripe.Checkout.Session, 'id' | 'customer' | 'mode' | 'status' | 'url' | 'metadata' | 'subscription'>
let sessions: CheckoutFixture[] = []
async function organization() {
  const org = await db.organization.create({ data: { name: `Checkout fixture ${randomUUID()}` } })
  orgs.push(org.id); return org
}
beforeAll(() => {
  provider.getStripe.mockReturnValue({ customers: { create: provider.customer }, subscriptions: { list: provider.subscriptions },
    checkout: { sessions: { create: provider.create, list: provider.list, retrieve: provider.retrieve, expire: provider.expire } }, billingPortal: { sessions: { create: provider.portal } } })
})
beforeEach(() => {
  sessions = []; vi.clearAllMocks()
  provider.customer.mockImplementation(async () => ({ id: `cus_${randomUUID()}` }))
  provider.subscriptions.mockResolvedValue({ data: [], has_more: false })
  provider.list.mockImplementation(async () => ({ data: sessions, has_more: false }))
  provider.create.mockImplementation(async (input: Stripe.Checkout.SessionCreateParams) => {
    const session: CheckoutFixture = { id: `cs_${randomUUID()}`, customer: input.customer ?? null, mode: 'subscription', status: 'open', url: 'https://checkout.stripe.com/fixture', metadata: input.metadata as Record<string, string>, subscription: null }
    sessions.push(session); return session
  })
  provider.retrieve.mockImplementation(async (id: string) => sessions.find(session => session.id === id))
})
afterAll(async () => {
  await db.organization.deleteMany({ where: { id: { in: orgs } } })
  await db.$disconnect(); vi.unstubAllEnvs()
})

describe('checkout reservations against PostgreSQL with a simulated payment provider', () => {
  it('serializes competing plan requests into one active reservation and one provider checkout', async () => {
    const org = await organization()
    let release!: () => void
    const waiting = new Promise<void>(resolve => { release = resolve })
    provider.customer.mockImplementationOnce(async () => { await waiting; return { id: `cus_${randomUUID()}` } })
    const starter = createSubscriptionCheckout({ organizationId: org.id, planId: 'starter', userEmail: 'owner@example.test' })
    await vi.waitFor(() => expect(provider.customer).toHaveBeenCalledTimes(1))
    const pro = await createSubscriptionCheckout({ organizationId: org.id, planId: 'pro', userEmail: 'owner@example.test' })
    expect(pro).toHaveProperty('error')
    release(); expect(await starter).toHaveProperty('url')
    expect(provider.create).toHaveBeenCalledTimes(1)
    expect(await db.activityEvent.count({ where: { organizationId: org.id, eventName: 'subscription_checkout_attempt', metadataJson: { path: ['active'], equals: true } } })).toBe(1)
    const saved = await db.organization.findUniqueOrThrow({ where: { id: org.id } })
    expect(saved.subscriptionStatus).toBe('TRIALING')
    expect(saved.stripeSubscriptionId).toBeNull()
  })

  it('recovers a provider-accepted attempt after a simulated process crash and lease expiry without a new checkout', async () => {
    const org = await organization()
    const customerId = `cus_${randomUUID()}`
    await db.organization.update({ where: { id: org.id }, data: { stripeCustomerId: customerId } })
    const intent = { active: true, leaseToken: 'crashed-worker', leaseUntil: Date.now() - 1, planId: 'starter', priceId: PLANS.starter.stripePriceId,
      appUrl: 'https://billing.example.test', email: 'owner@example.test', customerId, sessionId: null }
    const attempt = await db.activityEvent.create({ data: { organizationId: org.id, eventName: 'subscription_checkout_attempt', entityType: 'organization', entityId: org.id, metadataJson: intent } })
    const accepted: CheckoutFixture = { id: `cs_${randomUUID()}`, customer: customerId, mode: 'subscription', status: 'open', url: 'https://checkout.stripe.com/recovered', subscription: null,
      metadata: { organizationId: org.id, planId: 'starter', fieldcloseCheckoutAttemptId: attempt.id } }
    sessions.push(accepted)
    expect(await createSubscriptionCheckout({ organizationId: org.id, planId: 'starter', userEmail: 'owner@example.test' })).toEqual({ url: accepted.url })
    expect(provider.create).not.toHaveBeenCalled()
    const saved = await db.activityEvent.findUniqueOrThrow({ where: { id: attempt.id } })
    expect(saved.metadataJson).toMatchObject({ sessionId: accepted.id, leaseUntil: 0 })
    expect(await db.activityEvent.count({ where: { organizationId: org.id, eventName: 'subscription_checkout_attempt' } })).toBe(1)
  })

  it('uses the same durable provider key after an uncertain failure and preserves the customer id', async () => {
    const org = await organization()
    provider.create.mockRejectedValueOnce(new Error('Response interrupted'))
    const input = { organizationId: org.id, planId: 'pro' as const, userEmail: 'owner@example.test' }
    expect(await createSubscriptionCheckout(input)).toHaveProperty('error')
    const original = provider.create.mock.calls[0]
    expect(await createSubscriptionCheckout(input)).toHaveProperty('url')
    expect(provider.create.mock.calls[1]).toEqual(original)
    expect(provider.customer).toHaveBeenCalledTimes(1)
  })
})
