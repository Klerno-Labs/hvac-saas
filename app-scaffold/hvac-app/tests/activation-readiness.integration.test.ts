import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
if (!process.env.TEST_DATABASE_URL || !new URL(process.env.TEST_DATABASE_URL).pathname.endsWith('_test')) throw new Error('Dedicated TEST_DATABASE_URL required')
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL
const { db } = await import('@/lib/db')
const { getActivationReadiness, ACCOUNT_VERIFICATION_MAX_AGE_MS } = await import('@/lib/activation-readiness')
const { reconcileConfirmedPayment } = await import('@/lib/payment-reconciliation')
const now = new Date('2026-09-26T12:00:00Z')
let org: Awaited<ReturnType<typeof db.organization.create>>
let other: Awaited<ReturnType<typeof db.organization.create>>
let customerId: string
let jobId: string
const status = () => getActivationReadiness({ organizationId: org.id, organization: org, role: 'owner' }, now)
async function verification(mode = 'live', accountId = org.stripeConnectedAccountId, createdAt = new Date(now.getTime() - 1000), eventType = 'stripe_account_verified', organizationId = org.id) {
  return db.auditLog.create({ data: { organizationId, targetType: 'organization', targetId: organizationId, eventType, createdAt,
    metadata: { mode, accountId, chargesEnabled: true, payoutsEnabled: true } } })
}
beforeAll(async () => {
  org = await db.organization.create({ data: { name: 'Setup proof fixture', tradeType: 'plumbing', timezone: 'America/Chicago', subscriptionStatus: 'ACTIVE',
    stripeConnectedAccountId: `acct_${randomUUID()}`, stripeChargesEnabled: true, stripePayoutsEnabled: true } })
  other = await db.organization.create({ data: { name: 'Other setup fixture' } })
  customerId = (await db.customer.create({ data: { organizationId: org.id, firstName: 'Setup fixture' } })).id
  jobId = (await db.job.create({ data: { organizationId: org.id, customerId, title: 'Setup payment fixture' } })).id
})
beforeEach(async () => {
  vi.stubEnv('STRIPE_SECRET_KEY', 'sk_live_fixture')
  vi.stubEnv('STRIPE_CONNECT_WEBHOOK_SECRET', 'whsec_connect_fixture')
  vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_platform_fixture')
  vi.stubEnv('APP_URL', 'https://app.example.test')
  await db.auditLog.deleteMany({ where: { organizationId: { in: [org.id, other.id] } } })
})
afterEach(() => vi.unstubAllEnvs())
afterAll(async () => {
  await db.organization.deleteMany({ where: { id: { in: [org.id, other.id] } } })
  await db.$disconnect()
})

describe('live activation evidence in PostgreSQL', () => {
  it('ignores test, different-account, different-tenant, and expired verification evidence', async () => {
    await verification('test')
    await verification('live', 'acct_different')
    await verification('live', org.stripeConnectedAccountId, new Date(now.getTime() - 1000), 'stripe_account_verified', other.id)
    await verification('live', org.stripeConnectedAccountId, new Date(now.getTime() - ACCOUNT_VERIFICATION_MAX_AGE_MS - 1000))
    expect((await status()).steps.find(step => step.id === 'payments')?.complete).toBe(false)
  })
  it('requires recent successful matching verification and invalidates it on a newer failure', async () => {
    await verification('live', org.stripeConnectedAccountId, new Date(now.getTime() - 2000))
    expect((await status()).steps.find(step => step.id === 'payments')?.complete).toBe(true)
    await verification('live', org.stripeConnectedAccountId, new Date(now.getTime() - 1000), 'stripe_account_verification_failed')
    expect((await status()).steps.find(step => step.id === 'payments')?.complete).toBe(false)
  })
  it('requires current charges and payouts even with matching live verification', async () => {
    await verification()
    const result = await getActivationReadiness({ organizationId: org.id, role: 'owner', organization: { ...org, stripeChargesEnabled: false } }, now)
    expect(result.steps.find(step => step.id === 'payments')?.complete).toBe(false)
  })
  it('does not promote test or unspecified settlements after a key-mode change, but counts verified live settlement', async () => {
    async function settle(livemode?: boolean) {
      const invoice = await db.invoice.create({ data: { organizationId: org.id, customerId, jobId, invoiceNumber: randomUUID(), status: 'sent', totalCents: 1000, outstandingCents: 1000 } })
      await reconcileConfirmedPayment({ invoiceId: invoice.id, organizationId: org.id, connectedAccountId: org.stripeConnectedAccountId!,
        paymentIntentId: `pi_${randomUUID()}`, amountCents: 1000, currency: 'usd', method: 'checkout', ...(typeof livemode === 'boolean' ? { livemode } : {}) })
    }
    await settle(false)
    await settle()
    expect((await status()).steps.find(step => step.id === 'first-payment')?.complete).toBe(false)
    await settle(true)
    expect((await status()).steps.find(step => step.id === 'first-payment')?.complete).toBe(true)
  })
})
