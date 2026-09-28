import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'node:crypto'

const provider = vi.hoisted(() => ({ retrieve: vi.fn(), dunning: vi.fn() }))
vi.mock('next/headers', () => ({ headers: async () => new Headers({ 'stripe-signature': 'fixture_signature' }) }))
vi.mock('@/lib/stripe', () => ({ getStripe: () => ({ webhooks: { constructEvent: (body: string) => JSON.parse(body) }, subscriptions: { retrieve: provider.retrieve } }) }))
vi.mock('@/lib/billing-dunning', () => ({ sendDunningEmail: provider.dunning }))
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }))
if (!process.env.TEST_DATABASE_URL || !new URL(process.env.TEST_DATABASE_URL).pathname.endsWith('_test')) throw new Error('Dedicated TEST_DATABASE_URL required')
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL
const { db } = await import('@/lib/db')
const { POST } = await import('@/app/api/billing/webhook/route')
const organizationIds: string[] = []
const eventIds: string[] = []

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('VERCEL_ENV', 'preview')
  vi.stubEnv('STRIPE_SECRET_KEY', 'rk_test_fixture')
  vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_platform')
  vi.stubEnv('STRIPE_CONNECT_WEBHOOK_SECRET', 'whsec_connect')
  vi.stubEnv('STRIPE_STARTER_PRICE_ID', 'price_fieldclose_starter')
  vi.stubEnv('STRIPE_PRO_PRICE_ID', 'price_fieldclose_pro')
})
afterEach(() => vi.unstubAllEnvs())
afterAll(async () => {
  await db.webhookEvent.deleteMany({ where: { stripeEventId: { in: eventIds } } })
  await db.organization.deleteMany({ where: { id: { in: organizationIds } } })
  await db.$disconnect()
})

async function fixture() {
  const org = await db.organization.create({ data: { name: 'Webhook association fixture', stripeCustomerId: `cus_${randomUUID()}`, stripeSubscriptionId: `sub_${randomUUID()}`, subscriptionStatus: 'ACTIVE', plan: 'STARTER' } })
  organizationIds.push(org.id)
  const subscription = { id: org.stripeSubscriptionId!, customer: org.stripeCustomerId!, status: 'active', metadata: { organizationId: org.id, planId: 'starter' }, items: { data: [{ price: { id: 'price_fieldclose_starter' }, quantity: 1 }] } }
  provider.retrieve.mockResolvedValue(subscription)
  return { org, subscription }
}
function request(subscription: unknown, eventId = `evt_${randomUUID()}`) {
  eventIds.push(eventId)
  const body = JSON.stringify({ id: eventId, type: 'customer.subscription.updated', livemode: false, data: { object: subscription } })
  return { eventId, send: () => POST(new Request('http://localhost/api/billing/webhook', { method: 'POST', body })) }
}

describe('shared-account billing ownership and ordering in PostgreSQL', () => {
  it('does not mutate or claim an unrelated subscription sharing the FieldClose customer', async () => {
    const { org, subscription } = await fixture()
    const unrelated = { ...subscription, id: `sub_foreign_${randomUUID()}`, metadata: { organizationId: 'foreign_application_org', planId: 'starter' }, items: { data: [{ price: { id: 'price_foreign_app' }, quantity: 1 }] } }
    provider.retrieve.mockResolvedValue(unrelated)
    const event = request(unrelated)
    expect(await (await event.send()).json()).toEqual({ received: true, ignored: true })
    expect(await db.organization.findUniqueOrThrow({ where: { id: org.id } })).toMatchObject({ stripeSubscriptionId: org.stripeSubscriptionId, subscriptionStatus: 'ACTIVE', updatedAt: org.updatedAt })
    expect(await db.webhookEvent.count({ where: { stripeEventId: event.eventId } })).toBe(0)
    expect(provider.dunning).not.toHaveBeenCalled()
  })

  it.each(['starter', 'pro'])('binds a verified initial %s subscription with the exact configured price', async planId => {
    const { org, subscription } = await fixture()
    await db.organization.update({ where: { id: org.id }, data: { stripeSubscriptionId: null, subscriptionStatus: 'TRIALING' } })
    const current = { ...subscription, metadata: { organizationId: org.id, planId }, items: { data: [{ price: { id: `price_fieldclose_${planId}` }, quantity: 1 }] } }
    provider.retrieve.mockResolvedValue(current)
    const event = request(current)
    expect((await event.send()).status).toBe(200)
    expect(await db.organization.findUniqueOrThrow({ where: { id: org.id } })).toMatchObject({ stripeSubscriptionId: subscription.id, subscriptionStatus: 'ACTIVE', plan: planId.toUpperCase() })
    expect(await db.webhookEvent.findUniqueOrThrow({ where: { stripeEventId: event.eventId } })).toMatchObject({ status: 'processed' })
  })

  it('rolls back a stale active event after concurrent cancellation, then retries using current provider state', async () => {
    const { org, subscription } = await fixture()
    let release!: () => void
    let entered!: () => void
    const providerStarted = new Promise<void>(resolve => { entered = resolve })
    const pendingResponse = new Promise<void>(resolve => { release = resolve })
    provider.retrieve.mockImplementationOnce(async () => { entered(); await pendingResponse; return subscription })
    const stale = request(subscription)
    const activeWorker = stale.send()
    await providerStarted
    const canceled = { ...subscription, status: 'canceled' }
    provider.retrieve.mockResolvedValue(canceled)
    const cancellation = request(canceled)
    try {
      expect((await cancellation.send()).status).toBe(200)
    } finally { release() }
    expect((await activeWorker).status).toBe(500)
    expect(await db.webhookEvent.count({ where: { stripeEventId: stale.eventId } })).toBe(0)
    expect(await db.organization.findUniqueOrThrow({ where: { id: org.id } })).toMatchObject({ subscriptionStatus: 'CANCELED', readOnlyAt: expect.any(Date) })
    expect((await stale.send()).status).toBe(200)
    expect(await db.organization.findUniqueOrThrow({ where: { id: org.id } })).toMatchObject({ subscriptionStatus: 'CANCELED', readOnlyAt: expect.any(Date) })
    expect(await db.webhookEvent.findUniqueOrThrow({ where: { stripeEventId: stale.eventId } })).toMatchObject({ status: 'processed' })
  })
})
