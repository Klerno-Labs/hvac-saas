import { describe, it, expect, beforeEach, vi } from 'vitest'

// --- Mocks -----------------------------------------------------------------

const mockConstructEvent = vi.fn()
const mockCustomersCreate = vi.fn()
const mockPortalCreate = vi.fn()
vi.mock('@/lib/stripe', () => ({
  getStripe: () => ({
    webhooks: { constructEvent: mockConstructEvent },
    customers: { create: mockCustomersCreate },
    billingPortal: { sessions: { create: mockPortalCreate } },
  }),
}))

const db = vi.hoisted(() => ({
  webhookEvent: { create: vi.fn(), update: vi.fn() },
  organization: { findFirst: vi.fn(), update: vi.fn() },
}))
vi.mock('@/lib/db', () => ({ db }))

const dunning = vi.hoisted(() => ({
  sendDunningEmail: vi.fn(),
  clearDunningState: vi.fn(),
}))
vi.mock('@/lib/dunning', () => dunning)

vi.mock('@/lib/events', () => ({ trackEvent: vi.fn().mockResolvedValue(undefined) }))

// Imported after mocks are registered.
const { POST } = await import('@/app/api/billing/webhook/route')
const { makeEvent, makeSubscription, makeInvoice, prismaUniqueViolation } = await import('./fixtures')

// --- Helpers ---------------------------------------------------------------

function signedRequest(body: string): Request {
  return new Request('http://localhost/api/billing/webhook', {
    method: 'POST',
    headers: { 'content-type': 'text/plain', 'stripe-signature': 't=1,v1=fake' },
    body,
  })
}

function orgFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'org_test_1',
    plan: 'STARTER',
    subscriptionStatus: 'ACTIVE',
    readOnlyAt: null,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test'
  process.env.APP_URL = 'http://localhost:3000'
  // By default, idempotency insert succeeds (first delivery of an event).
  db.webhookEvent.create.mockResolvedValue({})
  db.webhookEvent.update.mockResolvedValue({})
})

describe('POST /api/billing/webhook — signature verification (a)', () => {
  it('rejects an unverified/bad-signature body with 400 and writes nothing to the DB', async () => {
    mockConstructEvent.mockImplementation(() => {
      throw new Error('No signatures found matching the expected signature for payload')
    })

    const res = await POST(signedRequest('not-actually-signed') as never)

    expect(res.status).toBe(400)
    expect(db.webhookEvent.create).not.toHaveBeenCalled()
    expect(db.organization.update).not.toHaveBeenCalled()
    expect(dunning.sendDunningEmail).not.toHaveBeenCalled()
  })

  it('returns 400 when STRIPE_WEBHOOK_SECRET is not configured', async () => {
    delete process.env.STRIPE_WEBHOOK_SECRET
    const res = await POST(signedRequest('x') as never)
    expect(res.status).toBe(400)
    expect(mockConstructEvent).not.toHaveBeenCalled()
  })
})

describe('POST /api/billing/webhook — invoice.payment_failed + dunning (b)', () => {
  it('marks the org PAST_DUE and sends a dunning email exactly once', async () => {
    const event = makeEvent('invoice.payment_failed', makeInvoice())
    mockConstructEvent.mockReturnValue(event)
    db.organization.findFirst.mockResolvedValue(orgFixture())
    dunning.sendDunningEmail.mockResolvedValue({ sent: true, attempt: 1 })

    const res = await POST(signedRequest('{}') as never)
    const json = await res.json()

    expect(res.status).toBe(200)
    // Org resolved by Stripe IDs, never by a payload orgId.
    expect(db.organization.findFirst).toHaveBeenCalledWith({
      where: { OR: [{ stripeCustomerId: 'cus_test_1' }, { stripeSubscriptionId: 'sub_test_1' }] },
      select: expect.any(Object),
    })
    expect(db.organization.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'org_test_1' },
        data: expect.objectContaining({ subscriptionStatus: 'PAST_DUE' }),
      }),
    )
    expect(dunning.sendDunningEmail).toHaveBeenCalledTimes(1)
    expect(dunning.sendDunningEmail).toHaveBeenCalledWith({ orgId: 'org_test_1', invoiceId: 'in_test_1' })
    expect(json).toEqual({ received: true })
  })

  it('a REPLAY of the same stripeEventId does NOT reprocess or re-send (idempotent)', async () => {
    const event = makeEvent('invoice.payment_failed', makeInvoice())
    mockConstructEvent.mockReturnValue(event)
    db.organization.findFirst.mockResolvedValue(orgFixture())
    dunning.sendDunningEmail.mockResolvedValue({ sent: true, attempt: 1 })

    // First delivery: insert succeeds.
    await POST(signedRequest('{}') as never)
    expect(dunning.sendDunningEmail).toHaveBeenCalledTimes(1)

    // Snapshot call counts so we can assert the REPLAY performs no NEW work
    // (clearAllMocks only runs in beforeEach, before the first delivery).
    const orgUpdatesBefore = db.organization.update.mock.calls.length
    const dunningCallsBefore = dunning.sendDunningEmail.mock.calls.length
    const orgLookupsBefore = db.organization.findFirst.mock.calls.length

    // Replay: the idempotency insert now violates the unique constraint.
    db.webhookEvent.create.mockRejectedValue(prismaUniqueViolation())
    const res = await POST(signedRequest('{}') as never)
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json).toEqual({ received: true, duplicate: true })
    // No additional DB mutation, no org resolution, no additional dunning send.
    expect(db.organization.findFirst.mock.calls.length).toBe(orgLookupsBefore)
    expect(db.organization.update.mock.calls.length).toBe(orgUpdatesBefore)
    expect(dunning.sendDunningEmail.mock.calls.length).toBe(dunningCallsBefore) // still 1, not 2
  })

  it('does not crash when no org matches the Stripe IDs (permanent error -> 200, no dunning)', async () => {
    const event = makeEvent('invoice.payment_failed', makeInvoice())
    mockConstructEvent.mockReturnValue(event)
    db.organization.findFirst.mockResolvedValue(null)

    const res = await POST(signedRequest('{}') as never)
    expect(res.status).toBe(200)
    expect(dunning.sendDunningEmail).not.toHaveBeenCalled()
  })
})

describe('POST /api/billing/webhook — subscription lifecycle (c, d)', () => {
  it('customer.subscription.deleted sets readOnlyAt (freeze)', async () => {
    const event = makeEvent(
      'customer.subscription.deleted',
      makeSubscription({ status: 'canceled' }),
    )
    mockConstructEvent.mockReturnValue(event)
    db.organization.findFirst.mockResolvedValue(orgFixture())

    const res = await POST(signedRequest('{}') as never)

    expect(res.status).toBe(200)
    const updateCall = db.organization.update.mock.calls[0][0]
    expect(updateCall.where).toEqual({ id: 'org_test_1' })
    expect(updateCall.data.subscriptionStatus).toBe('CANCELED')
    expect(updateCall.data.readOnlyAt).toBeInstanceOf(Date)
    expect(updateCall.data.stripeSubscriptionId).toBe('sub_test_1')
  })

  it('customer.subscription.updated -> active clears readOnlyAt (unfreeze)', async () => {
    const event = makeEvent('customer.subscription.updated', makeSubscription({ status: 'active' }))
    mockConstructEvent.mockReturnValue(event)
    // Org is currently frozen.
    db.organization.findFirst.mockResolvedValue(orgFixture({ readOnlyAt: new Date('2024-01-01') }))

    const res = await POST(signedRequest('{}') as never)

    expect(res.status).toBe(200)
    const updateCall = db.organization.update.mock.calls[0][0]
    expect(updateCall.data.subscriptionStatus).toBe('ACTIVE')
    expect(updateCall.data.readOnlyAt).toBeNull()
  })

  it('customer.subscription.updated -> past_due leaves readOnlyAt untouched (grace)', async () => {
    const event = makeEvent('customer.subscription.updated', makeSubscription({ status: 'past_due' }))
    mockConstructEvent.mockReturnValue(event)
    db.organization.findFirst.mockResolvedValue(orgFixture({ readOnlyAt: null }))

    await POST(signedRequest('{}') as never)

    const updateCall = db.organization.update.mock.calls[0][0]
    expect(updateCall.data.subscriptionStatus).toBe('PAST_DUE')
    // readOnlyAt key must be absent (not null), so the column is left as-is.
    expect(updateCall.data).not.toHaveProperty('readOnlyAt')
  })

  it('invoice.payment_succeeded unfreezes + clears dunning state', async () => {
    const event = makeEvent('invoice.payment_succeeded', makeInvoice())
    mockConstructEvent.mockReturnValue(event)
    db.organization.findFirst.mockResolvedValue(orgFixture({ readOnlyAt: new Date('2024-01-01') }))
    dunning.clearDunningState.mockResolvedValue(undefined)

    const res = await POST(signedRequest('{}') as never)

    expect(res.status).toBe(200)
    const updateCall = db.organization.update.mock.calls[0][0]
    expect(updateCall.data.subscriptionStatus).toBe('ACTIVE')
    expect(updateCall.data.readOnlyAt).toBeNull()
    expect(dunning.clearDunningState).toHaveBeenCalledWith('org_test_1')
  })
})
