import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type Stripe from 'stripe'

type AttemptRow = { id: string; organizationId: string; createdAt: Date; metadataJson: Record<string, unknown> }
const fixture = vi.hoisted(() => {
  vi.stubEnv('STRIPE_STARTER_PRICE_ID', 'price_starter_fixture')
  vi.stubEnv('STRIPE_PRO_PRICE_ID', 'price_pro_fixture')
  vi.stubEnv('APP_URL', 'https://fieldclose.example.test')
  return {
    org: { id: 'org-fixture', stripeCustomerId: null as string | null, stripeSubscriptionId: null as string | null, subscriptionStatus: 'TRIALING' },
    attempts: [] as AttemptRow[], sessions: [] as Stripe.Checkout.Session[], subscriptions: [] as Stripe.Subscription[], inTransaction: false,
    getStripe: vi.fn(), transaction: vi.fn(), orgUpdate: vi.fn(), eventUpdate: vi.fn(),
    createCustomer: vi.fn(), listSessions: vi.fn(), createSession: vi.fn(), retrieveSession: vi.fn(), expireSession: vi.fn(), listSubscriptions: vi.fn(), portal: vi.fn(),
  }
})
vi.mock('@/lib/db', () => ({ db: { $transaction: fixture.transaction } }))
vi.mock('@/lib/stripe', () => ({ getStripe: fixture.getStripe }))
import { createSubscriptionCheckout, PLANS } from '@/lib/billing'

const request = (planId: 'starter' | 'pro' = 'starter') => ({ organizationId: 'org-fixture', planId, userEmail: 'owner@example.test' })
const providerBoundary = () => expect(fixture.inTransaction).toBe(false)
function session(overrides: Partial<Stripe.Checkout.Session> = {}): Stripe.Checkout.Session {
  return { id: 'cs_previous', customer: 'cus_fixture', mode: 'subscription', status: 'open', url: 'https://checkout.stripe.com/previous',
    subscription: null, metadata: { organizationId: 'org-fixture', planId: 'starter' }, ...overrides } as Stripe.Checkout.Session
}
function seedAttempt(overrides: Record<string, unknown> = {}, ageMs = 0) {
  const row: AttemptRow = { id: 'attempt-existing', organizationId: 'org-fixture', createdAt: new Date(Date.now() - ageMs), metadataJson: {
    active: true, leaseToken: 'old-worker', leaseUntil: 0, planId: 'starter', priceId: PLANS.starter.stripePriceId,
    appUrl: 'https://fieldclose.example.test', email: 'owner@example.test', customerId: 'cus_fixture', sessionId: null, ...overrides,
  } }
  fixture.attempts.push(row)
  fixture.org.stripeCustomerId = 'cus_fixture'
  return row
}

beforeEach(() => {
  vi.resetAllMocks()
  Object.assign(fixture.org, { stripeCustomerId: null, stripeSubscriptionId: null, subscriptionStatus: 'TRIALING' })
  fixture.attempts = []; fixture.sessions = []; fixture.subscriptions = []; fixture.inTransaction = false
  let tail = Promise.resolve()
  fixture.orgUpdate.mockImplementation(async ({ data }) => { Object.assign(fixture.org, data); return fixture.org })
  fixture.eventUpdate.mockImplementation(async ({ where, data }) => {
    const row = fixture.attempts.find(candidate => candidate.id === where.id)!
    row.metadataJson = structuredClone(data.metadataJson); return row
  })
  const tx = {
    $queryRaw: vi.fn(async () => [{ id: fixture.org.id }]),
    organization: { findUnique: vi.fn(async () => ({ ...fixture.org })), update: fixture.orgUpdate },
    activityEvent: {
      findFirst: vi.fn(async () => fixture.attempts.find(row => row.metadataJson.active) ?? null),
      findUniqueOrThrow: vi.fn(async ({ where }) => { const row = fixture.attempts.find(candidate => candidate.id === where.id); if (!row) throw new Error('missing'); return row }),
      create: vi.fn(async ({ data }) => {
        const row = { ...data, id: `attempt-${fixture.attempts.length + 1}`, createdAt: new Date(), metadataJson: structuredClone(data.metadataJson) }
        fixture.attempts.push(row); return row
      }), update: fixture.eventUpdate,
    },
  }
  fixture.transaction.mockImplementation(async (callback: (client: typeof tx) => Promise<unknown>) => {
    const previous = tail
    let release!: () => void
    tail = new Promise<void>(resolve => { release = resolve })
    await previous; fixture.inTransaction = true
    try { return await callback(tx) } finally { fixture.inTransaction = false; release() }
  })
  fixture.createCustomer.mockImplementation(async () => { providerBoundary(); return { id: 'cus_fixture' } })
  fixture.listSessions.mockImplementation(async () => { providerBoundary(); return { data: fixture.sessions, has_more: false } })
  fixture.listSubscriptions.mockImplementation(async () => { providerBoundary(); return { data: fixture.subscriptions, has_more: false } })
  fixture.createSession.mockImplementation(async (input: Stripe.Checkout.SessionCreateParams) => {
    providerBoundary()
    const created = session({ id: `cs_${fixture.sessions.length + 1}`, url: `https://checkout.stripe.com/session-${fixture.sessions.length + 1}`, metadata: input.metadata as Record<string, string> })
    fixture.sessions.push(created); return created
  })
  fixture.retrieveSession.mockImplementation(async (id: string) => { providerBoundary(); return fixture.sessions.find(candidate => candidate.id === id) })
  fixture.expireSession.mockImplementation(async (id: string) => { providerBoundary(); const found = fixture.sessions.find(candidate => candidate.id === id)!; found.status = 'expired'; return found })
  fixture.portal.mockImplementation(async () => { providerBoundary(); return { url: 'https://billing.stripe.com/fixture' } })
  fixture.getStripe.mockReturnValue({
    customers: { create: fixture.createCustomer }, subscriptions: { list: fixture.listSubscriptions },
    checkout: { sessions: { list: fixture.listSessions, create: fixture.createSession, retrieve: fixture.retrieveSession, expire: fixture.expireSession } },
    billingPortal: { sessions: { create: fixture.portal } },
  })
})
afterAll(() => vi.unstubAllEnvs())

describe('durable subscription checkout attempts', () => {
  it('creates a server-owned attempt and customer with stable keys without marking a subscription active', async () => {
    expect(await createSubscriptionCheckout(request())).toEqual({ url: 'https://checkout.stripe.com/session-1' })
    expect(fixture.createCustomer).toHaveBeenCalledWith({ email: 'owner@example.test', metadata: { organizationId: 'org-fixture' } }, expect.objectContaining({ idempotencyKey: 'fieldclose-customer-org-fixture', maxNetworkRetries: 0, timeout: 8000 }))
    expect(fixture.createSession).toHaveBeenCalledWith(expect.objectContaining({ customer: 'cus_fixture', line_items: [{ price: 'price_starter_fixture', quantity: 1 }],
      success_url: 'https://fieldclose.example.test/settings?subscription=processing', metadata: { organizationId: 'org-fixture', planId: 'starter', fieldcloseCheckoutAttemptId: 'attempt-1' } }), expect.objectContaining({ idempotencyKey: 'fieldclose-subscription-attempt-1' }))
    expect(fixture.org.subscriptionStatus).toBe('TRIALING')
    expect(fixture.org.stripeSubscriptionId).toBeNull()
    expect(fixture.attempts[0].metadataJson).toMatchObject({ customerId: 'cus_fixture', sessionId: 'cs_1', leaseUntil: 0 })
    expect(fixture.orgUpdate.mock.calls.every(([query]) => Object.keys(query.data).every(key => key === 'stripeCustomerId'))).toBe(true)
  })

  it('reuses an open same-plan checkout on retry', async () => {
    const first = await createSubscriptionCheckout(request())
    expect(await createSubscriptionCheckout(request())).toEqual(first)
    expect(fixture.createCustomer).toHaveBeenCalledTimes(1)
    expect(fixture.createSession).toHaveBeenCalledTimes(1)
  })

  it('serializes competing Starter/Pro requests and never sends the second request to the first plan', async () => {
    let release!: () => void
    const waiting = new Promise<void>(resolve => { release = resolve })
    fixture.createCustomer.mockImplementationOnce(async () => { providerBoundary(); await waiting; return { id: 'cus_fixture' } })
    const first = createSubscriptionCheckout(request('starter'))
    await vi.waitFor(() => expect(fixture.createCustomer).toHaveBeenCalledTimes(1))
    expect(await createSubscriptionCheckout(request('pro'))).toEqual({ error: 'A subscription checkout is being confirmed. Please wait before trying again.' })
    release(); await first
    expect(fixture.createSession).toHaveBeenCalledTimes(1)
    expect(fixture.attempts.filter(row => row.metadataJson.active)).toHaveLength(1)
  })

  it('expires an earlier open checkout before making the requested competing plan', async () => {
    await createSubscriptionCheckout(request('starter'))
    expect(await createSubscriptionCheckout(request('pro'))).toEqual({ url: 'https://checkout.stripe.com/session-2' })
    expect(fixture.expireSession).toHaveBeenCalledWith('cs_1', expect.any(Object))
    expect(fixture.expireSession.mock.invocationCallOrder[0]).toBeLessThan(fixture.createSession.mock.invocationCallOrder[1])
    expect(fixture.createSession.mock.calls[1][0].line_items).toEqual([{ price: 'price_pro_fixture', quantity: 1 }])
    expect(fixture.sessions.filter(item => item.status === 'open')).toHaveLength(1)
    expect(fixture.attempts.filter(row => row.metadataJson.active)).toHaveLength(1)
  })

  it('does not create a replacement when expiration races with completion or cannot be confirmed', async () => {
    await createSubscriptionCheckout(request())
    fixture.expireSession.mockRejectedValue(new Error('The previous session completed'))
    expect(await createSubscriptionCheckout(request('pro'))).toHaveProperty('error')
    expect(fixture.createSession).toHaveBeenCalledTimes(1)
  })

  it('recovers a lost provider response from its durable attempt metadata after the lease expires', async () => {
    const attempt = seedAttempt({}, 6 * 60 * 1000)
    fixture.sessions.push(session({ metadata: { organizationId: 'org-fixture', planId: 'starter', fieldcloseCheckoutAttemptId: attempt.id } }))
    expect(await createSubscriptionCheckout(request())).toEqual({ url: 'https://checkout.stripe.com/previous' })
    expect(fixture.createSession).not.toHaveBeenCalled()
    expect(attempt.metadataJson.sessionId).toBe('cs_previous')
  })

  it('retries an uncertain unrecorded request with identical payload and idempotency key, not a new attempt', async () => {
    fixture.createSession.mockRejectedValueOnce(new Error('Response lost'))
    expect(await createSubscriptionCheckout(request())).toHaveProperty('error')
    const original = fixture.createSession.mock.calls[0]
    expect(await createSubscriptionCheckout(request())).toHaveProperty('url')
    expect(fixture.createSession.mock.calls[1]).toEqual(original)
    expect(fixture.attempts).toHaveLength(1)
    expect(fixture.createCustomer).toHaveBeenCalledTimes(1)
  })

  it('does not blindly reuse an uncertain idempotency key beyond the provider retention window', async () => {
    seedAttempt({}, 25 * 60 * 60 * 1000)
    expect(await createSubscriptionCheckout(request())).toHaveProperty('error')
    expect(fixture.createSession).not.toHaveBeenCalled()
    expect(fixture.attempts).toHaveLength(1)
  })

  it('starts a fresh attempt only after the earlier checkout is confirmed expired', async () => {
    seedAttempt({ sessionId: 'cs_previous' }, 25 * 60 * 60 * 1000)
    fixture.sessions.push(session({ status: 'expired' }))
    expect(await createSubscriptionCheckout(request())).toHaveProperty('url')
    expect(fixture.createSession).toHaveBeenCalledTimes(1)
    expect(fixture.createSession.mock.calls[0][1].idempotencyKey).not.toContain('attempt-existing')
  })

  it('blocks a completed checkout without confirmed terminal subscription state', async () => {
    seedAttempt({ sessionId: 'cs_previous' })
    fixture.sessions.push(session({ status: 'complete', subscription: 'sub_pending' }))
    expect(await createSubscriptionCheckout(request())).toHaveProperty('error')
    expect(fixture.createSession).not.toHaveBeenCalled()
  })

  it.each(['canceled', 'incomplete_expired'] as const)('allows resubscription after provider-confirmed %s even when the prior owned session is complete', async status => {
    seedAttempt({ sessionId: 'cs_previous' })
    Object.assign(fixture.org, { stripeSubscriptionId: 'sub_old', subscriptionStatus: 'CANCELED' })
    fixture.sessions.push(session({ status: 'complete', subscription: 'sub_old' }))
    fixture.subscriptions.push({ id: 'sub_old', status } as Stripe.Subscription)
    expect(await createSubscriptionCheckout(request('pro'))).toHaveProperty('url')
    expect(fixture.createSession).toHaveBeenCalledTimes(1)
    expect(fixture.createSession.mock.calls[0][0].line_items).toEqual([{ price: 'price_pro_fixture', quantity: 1 }])
  })

  it.each(['active', 'incomplete', 'paused'] as const)('uses the portal for a provider %s subscription, even before the local webhook arrives', async status => {
    fixture.subscriptions.push({ id: 'sub_pending_webhook', status } as Stripe.Subscription)
    expect(await createSubscriptionCheckout(request())).toEqual({ url: 'https://billing.stripe.com/fixture' })
    expect(fixture.createSession).not.toHaveBeenCalled()
    expect(fixture.org.stripeSubscriptionId).toBeNull()
  })

  it.each(['local', 'provider'] as const)('returns a safe error when the %s subscription portal is unavailable', async source => {
    if (source === 'local') Object.assign(fixture.org, { stripeCustomerId: 'cus_fixture', stripeSubscriptionId: 'sub_existing', subscriptionStatus: 'ACTIVE' })
    else fixture.subscriptions.push({ id: 'sub_pending_webhook', status: 'active' } as Stripe.Subscription)
    fixture.portal.mockRejectedValue(new Error('Provider unavailable: private detail'))
    const result = await createSubscriptionCheckout(request())
    expect(result).toHaveProperty('error')
    expect(JSON.stringify(result)).not.toContain('private detail')
    expect(fixture.createSession).not.toHaveBeenCalled()
  })

  it('expires one discoverable legacy open checkout rather than leaving two payable sessions', async () => {
    fixture.org.stripeCustomerId = 'cus_fixture'; fixture.sessions.push(session())
    expect(await createSubscriptionCheckout(request('pro'))).toHaveProperty('url')
    expect(fixture.sessions.filter(item => item.status === 'open')).toHaveLength(1)
  })

  it.each(['history', 'foreign', 'unavailable'] as const)('fails closed when existing checkout state is %s', async condition => {
    fixture.org.stripeCustomerId = 'cus_fixture'
    if (condition === 'history') fixture.listSessions.mockResolvedValue({ data: [], has_more: true })
    if (condition === 'foreign') fixture.sessions.push(session({ metadata: { organizationId: 'another-org' } }))
    if (condition === 'unavailable') fixture.listSubscriptions.mockRejectedValue(new Error('Provider unavailable'))
    expect(await createSubscriptionCheckout(request())).toHaveProperty('error')
    expect(fixture.createSession).not.toHaveBeenCalled()
  })
})
