import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('@/lib/db', () => ({ db: {
  customer: { count: vi.fn() }, priceBookItem: { count: vi.fn() }, job: { count: vi.fn(), findFirst: vi.fn() },
  estimate: { count: vi.fn(), findFirst: vi.fn() }, invoice: { count: vi.fn() }, payment: { count: vi.fn() },
  organizationMember: { count: vi.fn() }, teamInvite: { count: vi.fn() },
  auditLog: { findFirst: vi.fn(), count: vi.fn() },
} }))
import { db } from '@/lib/db'
import { ACCOUNT_VERIFICATION_MAX_AGE_MS, deriveActivationReadiness, getActivationReadiness, getPaymentConfiguration, type ActivationOrganization, type ActivationFacts } from '@/lib/activation-readiness'
const databaseMocks = db as unknown as Record<string, Record<string, import('vitest').Mock>>

const now = new Date('2026-09-26T12:00:00Z')
const org: ActivationOrganization = { id: 'org-one', name: 'Field Service', tradeType: 'plumbing', timezone: 'America/Chicago',
  subscriptionStatus: 'ACTIVE', trialEndsAt: null, readOnlyAt: null, plan: 'PRO',
  stripeConnectedAccountId: 'acct_one', stripeChargesEnabled: true, stripePayoutsEnabled: true }
const facts: ActivationFacts = { customers: 0, pricedServices: 0, jobs: 0, sentEstimates: 0, invoices: 0, confirmedPayments: 0,
  members: 1, pendingInvites: 0, latestJobId: null, draftEstimateId: null, acceptedEstimateId: null, liveAccountVerified: false, liveConfirmedPayments: 0 }
const live = { mode: 'live', collectionConfigured: true } as const
const ready = (changes: Partial<ActivationOrganization> = {}, progress: Partial<ActivationFacts> = {}) => deriveActivationReadiness({ ...org, ...changes }, { ...facts, ...progress }, live, now)

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('STRIPE_SECRET_KEY', 'sk_live_fixture')
  vi.stubEnv('STRIPE_CONNECT_WEBHOOK_SECRET', 'whsec_connect')
  vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_platform')
  vi.stubEnv('APP_URL', 'https://app.example.test')
  for (const model of Object.values(databaseMocks)) for (const fn of Object.values(model)) fn.mockResolvedValue(0)
  vi.mocked(db.job.findFirst).mockResolvedValue({ id: 'job-one' } as never)
  vi.mocked(db.estimate.findFirst).mockResolvedValue(null)
  vi.mocked(db.auditLog.findFirst).mockResolvedValue(null)
})
afterEach(() => vi.unstubAllEnvs())

describe('activation progress from saved evidence', () => {
  it('excludes optional team membership from the required denominator and next action', () => {
    const result = ready({}, { customers: 1, pricedServices: 1, jobs: 1, sentEstimates: 1, invoices: 1, confirmedPayments: 1, liveConfirmedPayments: 1, liveAccountVerified: true })
    expect(result.completed).toBe(result.total)
    expect(result.total).toBe(7)
    expect(result.nextStep).toBeNull()
    expect(result.steps.find(step => step.id === 'team')).toMatchObject({ complete: false, optional: true })
  })
  it.each([null, '', 'Not/A_Timezone'])('requires a real saved business timezone: %s', timezone => {
    const result = ready({ timezone })
    expect(result.nextStep?.id).toBe('business')
    expect(result.nextAction.href).toBe('/setup/business')
  })
  it('requires a supported trade and nonblank name', () => {
    expect(ready({ tradeType: 'unknown' }).nextStep?.id).toBe('business')
    expect(ready({ name: '   ' }).nextStep?.id).toBe('business')
  })
  it('moves next action from profile to customers to priced services based on records', () => {
    expect(ready().nextAction.href).toBe('/customers/new')
    expect(ready({}, { customers: 1 }).nextAction.href).toBe('/pricebook/new')
    expect(ready({}, { customers: 1, pricedServices: 1 }).nextAction.href).toBe('/jobs/new')
  })
  it('does not count a draft as an issued estimate and sends the owner back to it', () => {
    const result = ready({}, { draftEstimateId: 'draft-one' })
    expect(result.steps.find(step => step.id === 'estimate')).toMatchObject({ complete: false, status: 'Draft saved', action: { href: '/estimates/draft-one' } })
  })
  it('uses a saved job when creating an estimate and never links to a missing jobId', () => {
    expect(ready().steps.find(step => step.id === 'estimate')?.action.href).toBe('/jobs/new')
    expect(ready({}, { latestJobId: 'job-one' }).steps.find(step => step.id === 'estimate')?.action.href).toBe('/estimates/new?jobId=job-one')
  })
  it('does not turn an invoice record into payment confirmation', () => {
    expect(ready({}, { invoices: 4 }).steps.find(step => step.id === 'first-payment')?.complete).toBe(false)
  })
  it('does not complete team setup from a pending invitation', () => {
    expect(ready({}, { pendingInvites: 1 }).steps.find(step => step.id === 'team')).toMatchObject({ complete: false, status: '1 invitations pending' })
  })
  it.each([
    { subscriptionStatus: 'CANCELED' as const },
    { subscriptionStatus: 'TRIALING' as const, trialEndsAt: new Date('2026-09-25') },
    { subscriptionStatus: 'TRIALING' as const, trialEndsAt: null },
    { readOnlyAt: now },
  ])('routes recovery through app billing while retaining setup progress: %s', changes => {
    const result = ready(changes, { customers: 1 })
    expect(result.writable).toBe(false)
    expect(result.nextAction.href).toBe('/settings/billing')
    expect(result.steps.find(step => step.id === 'customers')?.complete).toBe(true)
    expect(result.steps.find(step => step.id === 'business')?.action.href).toBe('/settings/billing')
    expect(result.steps.find(step => step.id === 'payments')?.action.href).toBe('/settings#payments')
  })
  it('allows an unexpired trial to continue setup without buying a plan first', () => {
    expect(ready({ subscriptionStatus: 'TRIALING', trialEndsAt: new Date('2026-10-01') }).writable).toBe(true)
  })
})

describe('customer collection configuration differs from app subscription', () => {
  const env = { STRIPE_SECRET_KEY: 'sk_live_example', STRIPE_WEBHOOK_SECRET: 'whsec_platform', STRIPE_CONNECT_WEBHOOK_SECRET: 'whsec_connect', APP_URL: 'https://app.example.test' }
  it('requires the customer payment webhook and secure public origin, not subscription price IDs', () => {
    expect(getPaymentConfiguration(env)).toEqual(live)
    expect(getPaymentConfiguration({ ...env, STRIPE_CONNECT_WEBHOOK_SECRET: '' }).collectionConfigured).toBe(false)
    expect(getPaymentConfiguration({ ...env, STRIPE_CONNECT_WEBHOOK_SECRET: env.STRIPE_WEBHOOK_SECRET }).collectionConfigured).toBe(false)
    expect(getPaymentConfiguration({ ...env, APP_URL: 'http://localhost:3000' }).collectionConfigured).toBe(false)
    expect(getPaymentConfiguration({ ...env, STRIPE_SECRET_KEY: 'not-a-stripe-key' }).mode).toBe('unavailable')
  })
  it('does not claim live collection or first-payment completion for a configured test account', () => {
    const config = getPaymentConfiguration({ ...env, STRIPE_SECRET_KEY: 'sk_test_example' })
    const result = deriveActivationReadiness(org, { ...facts, confirmedPayments: 1 }, config, now)
    expect(result.steps.find(step => step.id === 'payments')).toMatchObject({ complete: false, status: 'Test mode' })
    expect(result.steps.find(step => step.id === 'first-payment')).toMatchObject({ complete: false, status: 'Test payment recorded' })
  })
  it.each([{ stripeConnectedAccountId: null }, { stripeChargesEnabled: false }, { stripePayoutsEnabled: false }])('does not mark an incomplete connected account ready: %s', changes => {
    expect(ready(changes).steps.find(step => step.id === 'payments')?.complete).toBe(false)
  })
  it('does not imply payment readiness just because the app subscription is active', () => {
    const result = deriveActivationReadiness(org, { ...facts, confirmedPayments: 1 }, { mode: 'unavailable', collectionConfigured: false }, now)
    expect(result.subscriptionActive).toBe(true)
    expect(result.steps.find(step => step.id === 'payments')).toMatchObject({ complete: false, status: 'Unavailable' })
    expect(result.steps.find(step => step.id === 'first-payment')).toMatchObject({ complete: false, status: 'Live confirmation needed' })
  })
  it('switching keys from test to live never upgrades old flags or test payment history into live proof', () => {
    const history = { ...facts, confirmedPayments: 2 }
    const testResult = deriveActivationReadiness(org, history, getPaymentConfiguration({ ...env, STRIPE_SECRET_KEY: 'sk_test_example' }), now)
    const liveResult = deriveActivationReadiness(org, history, getPaymentConfiguration(env), now)
    for (const result of [testResult, liveResult]) {
      expect(result.steps.find(step => step.id === 'payments')?.complete).toBe(false)
      expect(result.steps.find(step => step.id === 'first-payment')?.complete).toBe(false)
    }
  })
  it('requires current account capabilities even when recent verification evidence exists', () => {
    expect(ready({ stripePayoutsEnabled: false }, { liveAccountVerified: true }).steps.find(step => step.id === 'payments')?.complete).toBe(false)
  })
  it('marks a new live-confirmed payment complete using durable matching proof', () => {
    expect(ready({}, { confirmedPayments: 1, liveConfirmedPayments: 1 }).steps.find(step => step.id === 'first-payment')?.complete).toBe(true)
  })
})

describe('activation read boundaries', () => {
  it.each(['technician', 'dispatcher', 'office_admin', 'member', 'unknown'])('rejects nonowners before any readiness queries: %s', async role => {
    await expect(getActivationReadiness({ organizationId: org.id, organization: org, role }, now)).rejects.toThrow('Owner access required')
    expect(db.customer.count).not.toHaveBeenCalled()
  })
  it('rejects inconsistent context instead of mixing organizations', async () => {
    await expect(getActivationReadiness({ organizationId: 'different-org', organization: org, role: 'owner' }, now)).rejects.toThrow('Owner access required')
  })
  it('scopes every query and counts only active records and confirmed payment evidence', async () => {
    await getActivationReadiness({ organizationId: org.id, organization: org, role: 'owner' }, now)
    for (const model of Object.values(databaseMocks)) for (const fn of Object.values(model)) {
      for (const [query] of fn.mock.calls) expect(query).toMatchObject({ where: { organizationId: org.id } })
    }
    expect(db.customer.count).toHaveBeenCalledWith({ where: { organizationId: org.id, deletedAt: null } })
    expect(db.priceBookItem.count).toHaveBeenCalledWith({ where: { organizationId: org.id, deletedAt: null, flatPriceCents: { gt: 0 } } })
    expect(db.payment.count).toHaveBeenCalledWith({ where: { organizationId: org.id, status: 'succeeded', paidAt: { not: null }, stripePaymentIntent: { not: null }, amountCents: { gt: 0 } } })
    expect(db.estimate.count).toHaveBeenCalledWith({ where: { organizationId: org.id, status: { in: ['sent', 'accepted', 'declined'] }, sentAt: { not: null } } })
    expect(db.auditLog.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({
      organizationId: org.id, createdAt: { gte: new Date(now.getTime() - ACCOUNT_VERIFICATION_MAX_AGE_MS), lte: now },
      AND: [{ metadata: { path: ['mode'], equals: 'live' } }, { metadata: { path: ['accountId'], equals: 'acct_one' } }],
    }), orderBy: { createdAt: 'desc' } }))
    expect(db.auditLog.count).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({
      organizationId: org.id, eventType: 'payment.recorded',
      AND: [{ metadata: { path: ['livemode'], equals: true } }, { metadata: { path: ['connectedAccountId'], equals: 'acct_one' } }, { metadata: { path: ['paymentIntentId'], string_starts_with: 'pi_' } }],
    }) }))
  })
  it('does not use a prior successful verification when the latest matching status check failed', async () => {
    vi.mocked(db.auditLog.findFirst).mockResolvedValue({ eventType: 'stripe_account_verification_failed', metadata: { mode: 'live', accountId: 'acct_one', chargesEnabled: true, payoutsEnabled: true } } as never)
    const result = await getActivationReadiness({ organizationId: org.id, organization: org, role: 'owner' }, now)
    expect(result.steps.find(step => step.id === 'payments')?.complete).toBe(false)
  })
  it('uses successful matching verification evidence with the current enabled capabilities', async () => {
    vi.mocked(db.auditLog.findFirst).mockResolvedValue({ eventType: 'stripe_account_verified', metadata: { mode: 'live', accountId: 'acct_one', chargesEnabled: true, payoutsEnabled: true } } as never)
    const result = await getActivationReadiness({ organizationId: org.id, organization: org, role: 'owner' }, now)
    expect(result.steps.find(step => step.id === 'payments')?.complete).toBe(true)
  })
})
