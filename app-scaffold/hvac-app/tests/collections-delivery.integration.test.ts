import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
const mocks = vi.hoisted(() => ({ email: vi.fn(), sms: vi.fn(), smsConfigured: vi.fn() }))
vi.mock('@/lib/email', () => ({ sendCollectionEmail: mocks.email }))
vi.mock('@/lib/sms', () => ({ sendCollectionSms: mocks.sms, isTwilioConfigured: mocks.smsConfigured }))
vi.mock('@/lib/portal', () => ({ getOrCreatePortalUrl: vi.fn(async () => 'https://example.test/private-token') }))
if (!process.env.TEST_DATABASE_URL || !new URL(process.env.TEST_DATABASE_URL).pathname.endsWith('_test')) throw new Error('Dedicated TEST_DATABASE_URL required')
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL
const { db } = await import('@/lib/db')
const { runCollectionsAutomation } = await import('@/lib/collections')
const { reconcileConfirmedPayment } = await import('@/lib/payment-reconciliation')
const { readCollectionDelivery } = await import('@/lib/collection-delivery')
const now = new Date('2026-09-26T15:00:00Z')
let organizationId: string
let customerId: string
let jobId: string
let invoiceId: string
beforeAll(async () => {
  organizationId = (await db.organization.create({ data: { name: 'Collections fixture', stripeConnectedAccountId: 'acct_collections_fixture', subscriptionStatus: 'ACTIVE', plan: 'PRO', timezone: 'America/Chicago', collectionsEnabled: true, smsEnabled: true, collectionsOverdue1Days: 1, collectionsOverdue2Days: 7, collectionsFinalDays: 14 } })).id
  customerId = (await db.customer.create({ data: { organizationId, firstName: 'Fixture', email: 'fixture@example.test', phone: '+15555550111' } })).id
  jobId = (await db.job.create({ data: { organizationId, customerId, title: 'Collections fixture' } })).id
})
beforeEach(async () => {
  vi.clearAllMocks()
  vi.stubEnv('RESEND_API_KEY', 're_fixture')
  mocks.smsConfigured.mockReturnValue(true)
  mocks.email.mockResolvedValue({ success: true, id: 'email_fixture' })
  mocks.sms.mockResolvedValue({ success: true, sid: 'SM_fixture' })
  await db.invoice.deleteMany({ where: { organizationId } })
  await db.organization.update({ where: { id: organizationId }, data: { readOnlyAt: null, collectionsEnabled: true } })
  invoiceId = (await db.invoice.create({ data: { organizationId, customerId, jobId, invoiceNumber: randomUUID(), status: 'sent', totalCents: 12000, outstandingCents: 12000, dueDate: new Date('2026-09-24T00:00:00Z') } })).id
})
afterAll(async () => { vi.unstubAllEnvs(); await db.organization.delete({ where: { id: organizationId } }); await db.$disconnect() })
const attempt = () => db.collectionAttempt.findFirstOrThrow({ where: { invoiceId } })

describe('durable collection channel outcomes', () => {
  it('retries an explicitly rejected email without repeating an accepted SMS', async () => {
    mocks.email.mockResolvedValueOnce({ success: false, error: 'Rejected', retryable: true })
    const first = await runCollectionsAutomation(now)
    expect(first).toMatchObject({ attemptsCreated: 1, channelsAccepted: 1, errors: 1 })
    expect((await attempt()).status).toBe('partial')
    await runCollectionsAutomation(new Date(now.getTime() + 30 * 60 * 1000))
    expect(mocks.email).toHaveBeenCalledTimes(1)
    await runCollectionsAutomation(new Date(now.getTime() + 2 * 60 * 60 * 1000))
    expect(mocks.email).toHaveBeenCalledTimes(2)
    expect(mocks.sms).toHaveBeenCalledTimes(1)
    expect((await attempt()).status).toBe('sent')
    expect(mocks.email.mock.calls[0][0].idempotencyKey).toMatch(/\/email\/1$/)
    expect(mocks.email.mock.calls[1][0].idempotencyKey).toMatch(/\/email\/2$/)
  })
  it('does not retry ambiguous provider failures or falsely mark the stage sent', async () => {
    mocks.email.mockResolvedValue({ success: false, error: 'Network uncertainty', retryable: false })
    mocks.sms.mockRejectedValue(new Error('Provider response lost'))
    await runCollectionsAutomation(now)
    await runCollectionsAutomation(new Date(now.getTime() + 24 * 60 * 60 * 1000))
    expect(mocks.email).toHaveBeenCalledTimes(1)
    expect(mocks.sms).toHaveBeenCalledTimes(1)
    expect((await attempt()).status).toBe('review')
    expect(readCollectionDelivery((await attempt()).notes)).toMatchObject({ email: { status: 'review' }, sms: { status: 'review' } })
  })
  it('allows concurrent workers to claim each channel only once', async () => {
    await Promise.all(Array.from({ length: 5 }, () => runCollectionsAutomation(now)))
    expect(mocks.email).toHaveBeenCalledTimes(1)
    expect(mocks.sms).toHaveBeenCalledTimes(1)
    expect(await db.collectionAttempt.count({ where: { invoiceId } })).toBe(1)
    expect((await attempt()).status).toBe('sent')
  })
  it('does not rush through every overdue stage when concurrent runs find all thresholds due', async () => {
    await db.invoice.update({ where: { id: invoiceId }, data: { dueDate: new Date('2026-08-01T00:00:00Z') } })
    await Promise.all(Array.from({ length: 5 }, () => runCollectionsAutomation(now)))
    expect(mocks.email).toHaveBeenCalledTimes(1)
    expect(mocks.sms).toHaveBeenCalledTimes(1)
    expect(await db.collectionAttempt.count({ where: { invoiceId } })).toBe(1)
    await runCollectionsAutomation(new Date(now.getTime() + 24 * 60 * 60 * 1000))
    expect(mocks.email).toHaveBeenCalledTimes(2)
    expect(mocks.sms).toHaveBeenCalledTimes(2)
    expect(await db.collectionAttempt.count({ where: { invoiceId } })).toBe(2)
  })
  it.each([true, false])('payment stops an in-flight stage even when the late provider result is success=%s', async success => {
    let finish!: (result: unknown) => void
    mocks.email.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const running = runCollectionsAutomation(now)
    await vi.waitFor(() => expect(mocks.email).toHaveBeenCalledTimes(1))
    await reconcileConfirmedPayment({ invoiceId, organizationId, connectedAccountId: 'acct_collections_fixture', paymentIntentId: `pi_${randomUUID()}`, amountCents: 12000, currency: 'usd', method: 'checkout' })
    expect((await attempt()).status).toBe('skipped')
    finish(success ? { success: true, id: 'email_late_receipt' } : { success: false, retryable: true, error: 'Rejected' })
    await running
    expect((await attempt()).status).toBe('skipped')
    expect(readCollectionDelivery((await attempt()).notes)?.email.status).toBe(success ? 'accepted' : 'retry')
    if (success) expect(readCollectionDelivery((await attempt()).notes)?.email.providerId).toBe('email_late_receipt')
    expect(mocks.sms).not.toHaveBeenCalled()
    await runCollectionsAutomation(new Date(now.getTime() + 24 * 60 * 60 * 1000))
    expect(mocks.email).toHaveBeenCalledTimes(1)
  })
  it('retains unavailable-channel work and retries after configuration becomes available', async () => {
    vi.stubEnv('RESEND_API_KEY', '')
    mocks.smsConfigured.mockReturnValue(false)
    await runCollectionsAutomation(now)
    expect(mocks.email).not.toHaveBeenCalled()
    expect(mocks.sms).not.toHaveBeenCalled()
    expect((await attempt()).status).toBe('retry')
    vi.stubEnv('RESEND_API_KEY', 're_fixture')
    mocks.smsConfigured.mockReturnValue(true)
    await runCollectionsAutomation(new Date(now.getTime() + 2 * 60 * 60 * 1000))
    expect((await attempt()).status).toBe('sent')
  })
  it.each(['created', 'failed'])('does not replay legacy %s rows whose provider outcome was never recorded', async status => {
    await db.collectionAttempt.create({ data: { organizationId, invoiceId, stage: 'overdue_1', status, notes: 'Auto-created: 2 days past due' } })
    await runCollectionsAutomation(now)
    expect(mocks.email).not.toHaveBeenCalled()
    expect(mocks.sms).not.toHaveBeenCalled()
    expect((await attempt()).status).toBe('review')
  })
  it('stops stale in-flight claims for review instead of replaying a possible accepted send', async () => {
    await db.collectionAttempt.create({ data: { organizationId, invoiceId, stage: 'overdue_1', status: 'sending', notes: JSON.stringify({ version: 1,
      email: { status: 'sending', attempts: 1, attemptedAt: new Date(now.getTime() - 20 * 60 * 1000).toISOString() }, sms: { status: 'accepted', attempts: 1, providerId: 'SM_old' },
    }) } })
    await runCollectionsAutomation(now)
    expect(mocks.email).not.toHaveBeenCalled()
    expect(mocks.sms).not.toHaveBeenCalled()
    expect((await attempt()).status).toBe('review')
  })
  it('does not retry reminders after an invoice is paid or workspace is frozen', async () => {
    mocks.email.mockResolvedValue({ success: false, error: 'Rejected', retryable: true })
    await runCollectionsAutomation(now)
    await db.invoice.update({ where: { id: invoiceId }, data: { status: 'paid', outstandingCents: 0 } })
    await runCollectionsAutomation(new Date(now.getTime() + 2 * 60 * 60 * 1000))
    expect(mocks.email).toHaveBeenCalledTimes(1)
    await db.invoice.update({ where: { id: invoiceId }, data: { status: 'sent', outstandingCents: 12000 } })
    await db.organization.update({ where: { id: organizationId }, data: { readOnlyAt: now } })
    await runCollectionsAutomation(new Date(now.getTime() + 2 * 60 * 60 * 1000))
    expect(mocks.email).toHaveBeenCalledTimes(1)
  })
  it('uses the business calendar day when evaluating overdue thresholds', async () => {
    await db.invoice.update({ where: { id: invoiceId }, data: { dueDate: new Date('2026-09-26T00:00:00Z') } })
    await runCollectionsAutomation(new Date('2026-09-27T00:30:00Z'))
    expect(mocks.email).not.toHaveBeenCalled()
    await runCollectionsAutomation(new Date('2026-09-27T15:00:00Z'))
    expect(mocks.email).toHaveBeenCalledTimes(1)
  })
  it('processes beyond a full batch of already completed stages without starving later invoices', async () => {
    await db.invoice.deleteMany({ where: { organizationId } })
    const invoices = Array.from({ length: 501 }, (_, index) => ({ id: `${organizationId}-batch-${String(index).padStart(4, '0')}`, organizationId, customerId, jobId, invoiceNumber: `batch-${index}`, status: 'sent', totalCents: 12000, outstandingCents: 12000, dueDate: new Date('2026-09-24T00:00:00Z') }))
    await db.invoice.createMany({ data: invoices })
    await db.collectionAttempt.createMany({ data: invoices.slice(0, 500).map(invoice => ({ organizationId, invoiceId: invoice.id, stage: 'overdue_1', status: 'sent' })) })
    const result = await runCollectionsAutomation(now)
    expect(result).toMatchObject({ attemptsCreated: 1, attemptsSkipped: 1000, channelsAccepted: 2, errors: 0, needsReview: 0 })
    expect(mocks.email).toHaveBeenCalledTimes(1)
    expect(mocks.sms).toHaveBeenCalledTimes(1)
    expect(await db.collectionAttempt.findUniqueOrThrow({ where: { invoiceId_stage: { invoiceId: invoices[500].id, stage: 'overdue_1' } } })).toMatchObject({ status: 'sent' })
    expect(await db.collectionAttempt.count({ where: { organizationId, stage: 'overdue_1', status: 'sent' } })).toBe(501)
    // Keep the real 500-row page boundary: 501 invoices require 1,002 sequential
    // claim transactions, even for completed stages. Allow containerized CI's
    // database latency here without relaxing any concurrency test's deadline.
  }, 30_000)
})
