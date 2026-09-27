import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
if (!process.env.TEST_DATABASE_URL || !new URL(process.env.TEST_DATABASE_URL).pathname.endsWith('_test')) throw new Error('Dedicated TEST_DATABASE_URL required')
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL
const { db } = await import('@/lib/db')
const { reserveInvoicePaymentAttempt: reserve, saveInvoicePaymentProviderId: save, releaseInvoicePaymentLease: release, retireInvoicePaymentAttempt: retire, claimInvoicePaymentAttemptForCancellation: cancellation } = await import('@/lib/invoice-payment-attempt')
let organizationId: string, customerId: string, jobId: string, invoiceId: string
beforeAll(async () => {
  organizationId = (await db.organization.create({ data: { name: 'Isolated invoice attempt test', stripeConnectedAccountId: 'acct_attempt', stripeChargesEnabled: true, stripeTerminalEnabled: true, subscriptionStatus: 'ACTIVE', plan: 'PRO' } })).id
  customerId = (await db.customer.create({ data: { organizationId, firstName: 'Fixture' } })).id
  jobId = (await db.job.create({ data: { organizationId, customerId, title: 'Fixture' } })).id
})
beforeEach(async () => {
  await db.invoice.deleteMany({ where: { organizationId } }); await db.activityEvent.deleteMany({ where: { organizationId } })
  await db.customer.update({ where: { id: customerId }, data: { deletedAt: null } })
  await db.organization.update({ where: { id: organizationId }, data: { readOnlyAt: null, stripeConnectedAccountId: 'acct_attempt' } })
  invoiceId = (await db.invoice.create({ data: { organizationId, customerId, jobId, invoiceNumber: randomUUID(), status: 'sent', subtotalCents: 1000, totalCents: 1000, outstandingCents: 1000 } })).id
})
afterAll(async () => { await db.organization.delete({ where: { id: organizationId } }); await db.$disconnect() })
const input = (method: 'terminal' | 'checkout' = 'checkout') => ({ invoiceId, organizationId, method, buildParams: () => ({ amount: 1000, metadata: { privateFixture: 'not-in-response' } }) })
async function attempt(method: 'terminal' | 'checkout' = 'checkout') { const result = await reserve(input(method)); if (!result.success) throw Error(result.error); return result.attempt }

describe('durable cross-channel invoice payment reservation', () => {
  it('allows one concurrent winner across both channels', async () => {
    const results = await Promise.all(Array.from({ length: 8 }, (_, i) => reserve(input(i % 2 ? 'terminal' : 'checkout'))))
    expect(results.filter(r => r.success)).toHaveLength(1)
    expect(await db.activityEvent.count({ where: { organizationId, eventName: 'invoice_payment_attempt' } })).toBe(1)
  })
  it('retries an unknown result using the identical durable attempt and parameters', async () => {
    const first = await attempt(); expect(await release(first)).toBe(true)
    const result = await reserve({ ...input(), buildParams: () => ({ amount: 999, newParams: true }) })
    expect(result.success).toBe(true)
    if (result.success) { expect(result.attempt.id).toBe(first.id); expect(result.attempt.params).toEqual(first.params); expect(result.attempt.leaseToken).not.toBe(first.leaseToken) }
    expect(await save(first, 'cs_stale')).toBe(false)
  })
  it('blocks unknown outcomes after23hours without rotating provider identity', async () => {
    const first = await attempt(); await release(first)
    await db.activityEvent.update({ where: { id: first.id }, data: { createdAt: new Date(Date.now() - 23 * 60 * 60 * 1000) } })
    expect(await reserve(input())).toMatchObject({ success: false, error: expect.stringContaining('unknown') })
    expect(await db.activityEvent.count({ where: { organizationId } })).toBe(1)
  })
  it('records the terminal provider identity and pending payment atomically, then blocks checkout', async () => {
    const first = await attempt('terminal'); expect(await save(first, 'pi_attempt')).toBe(true)
    expect(await db.payment.findUnique({ where: { stripePaymentIntent: 'pi_attempt' } })).toMatchObject({ invoiceId, organizationId, status: 'pending', method: 'terminal' })
    expect((await reserve(input('checkout'))).success).toBe(false)
    const next = await attempt('terminal'); expect(next.id).toBe(first.id); expect(next.providerId).toBe('pi_attempt')
    expect(await retire(next)).toBe(true)
    expect((await db.payment.findUniqueOrThrow({ where: { stripePaymentIntent: 'pi_attempt' } })).status).toBe('canceled')
    expect((await reserve(input('checkout'))).success).toBe(true)
  })
  it('claims an active Checkout for cancellation without allowing concurrent collection', async () => {
    const first = await attempt(); expect(await save(first, 'cs_cancel')).toBe(true)
    const claim = await cancellation({ invoiceId, organizationId }); expect(claim.success).toBe(true)
    if (!claim.success || !claim.attempt) throw Error('Expected cancellation lease')
    expect((await reserve(input('terminal'))).success).toBe(false)
    expect(await retire(claim.attempt)).toBe(true)
    expect((await db.invoice.findUniqueOrThrow({ where: { id: invoiceId } })).stripeCheckoutSessionId).toBeNull()
    expect((await reserve(input('terminal'))).success).toBe(true)
  })
  it('claims a known Terminal cancellation exclusively and retires its pending payment', async () => {
    const first = await attempt('terminal'); expect(await save(first, 'pi_cancel_terminal')).toBe(true)
    expect((await cancellation({ invoiceId, organizationId })).success).toBe(false)
    const claim = await cancellation({ invoiceId, organizationId, method: 'terminal', invoiceWhere: { job: { assignedUserId: null } } })
    if (!claim.success || !claim.attempt) throw Error('Expected Terminal cancellation lease')
    expect(claim.attempt).toMatchObject({ id: first.id, method: 'terminal', providerId: 'pi_cancel_terminal', connectedAccountId: 'acct_attempt', amountCents: 1000 })
    expect((await cancellation({ invoiceId, organizationId, method: 'terminal' })).success).toBe(false)
    expect((await reserve(input())).success).toBe(false)
    expect(await retire(first)).toBe(false)
    expect(await retire(claim.attempt)).toBe(true)
    expect((await db.payment.findUniqueOrThrow({ where: { stripePaymentIntent: 'pi_cancel_terminal' } })).status).toBe('canceled')
    expect((await reserve(input())).success).toBe(true)
  })
  it('rejects Terminal cancellation for unassigned and other-tenant invoices before claiming', async () => {
    const first = await attempt('terminal'); await save(first, 'pi_cancel_scope')
    expect((await cancellation({ invoiceId, organizationId, method: 'terminal', invoiceWhere: { job: { assignedUserId: 'unassigned' } } })).success).toBe(false)
    expect((await cancellation({ invoiceId, organizationId: 'other-org', method: 'terminal' })).success).toBe(false)
    expect((await cancellation({ invoiceId, organizationId, method: 'terminal' })).success).toBe(true)
  })
  it('does not claim an unknown Terminal provider outcome or create a cancellation attempt', async () => {
    expect(await cancellation({ invoiceId, organizationId, method: 'terminal' })).toEqual({ success: true, attempt: null })
    expect(await db.activityEvent.count({ where: { organizationId } })).toBe(0)
    const first = await attempt('terminal'); await release(first)
    expect((await cancellation({ invoiceId, organizationId, method: 'terminal' })).success).toBe(false)
    expect(await db.activityEvent.count({ where: { organizationId } })).toBe(1)
  })
  it.each(['account', 'amount'])('rejects Terminal cancellation when its %s identity changed', async changed => {
    const first = await attempt('terminal'); await save(first, 'pi_cancel_changed')
    if (changed === 'account') await db.organization.update({ where: { id: organizationId }, data: { stripeConnectedAccountId: 'acct_changed' } })
    else await db.invoice.update({ where: { id: invoiceId }, data: { outstandingCents: 500 } })
    expect((await cancellation({ invoiceId, organizationId, method: 'terminal' })).success).toBe(false)
    expect((await db.payment.findUniqueOrThrow({ where: { stripePaymentIntent: 'pi_cancel_changed' } })).status).toBe('pending')
  })
  it.each(['paid', 'void', 'draft'])('does not reserve a %s invoice', async status => {
    await db.invoice.update({ where: { id: invoiceId }, data: { status } }); expect((await reserve(input())).success).toBe(false)
  })
  it.each([0, -1, 1001])('does not reserve invalid outstanding balance %s', async outstandingCents => {
    await db.invoice.update({ where: { id: invoiceId }, data: { outstandingCents } }); expect((await reserve(input())).success).toBe(false)
  })
  it('honors the portal customer and technician job predicate under the invoice lock', async () => {
    expect((await reserve({ ...input(), invoiceWhere: { customerId: 'other-customer' } })).success).toBe(false)
    expect((await reserve({ ...input(), invoiceWhere: { job: { assignedUserId: 'unassigned' } } })).success).toBe(false)
    expect(await db.activityEvent.count({ where: { organizationId } })).toBe(0)
  })
  it('rechecks deleted customers and read-only organization after caller authorization', async () => {
    await db.customer.update({ where: { id: customerId }, data: { deletedAt: new Date() } }); expect((await reserve(input())).success).toBe(false)
    await db.customer.update({ where: { id: customerId }, data: { deletedAt: null } })
    await db.organization.update({ where: { id: organizationId }, data: { readOnlyAt: new Date() } }); expect((await reserve(input())).success).toBe(false)
  })
  it('permits only the matching portal customer to settle an issued read-only invoice', async () => {
    await db.organization.update({ where: { id: organizationId }, data: { readOnlyAt: new Date() } })
    expect((await reserve({ ...input('terminal'), customerPaymentCustomerId: customerId })).success).toBe(false)
    expect((await reserve({ ...input(), customerPaymentCustomerId: 'other-customer' })).success).toBe(false)
    expect((await reserve({ ...input(), customerPaymentCustomerId: customerId })).success).toBe(true)
  })
  it('does not create over legacy pending payments, even without a provider id', async () => {
    await db.payment.create({ data: { organizationId, invoiceId, amountCents: 1000, status: 'pending', method: 'checkout' } })
    expect((await reserve(input())).success).toBe(false); expect((await reserve(input('terminal'))).success).toBe(false)
  })
  it('adopts a known legacy Checkout for retrieval but does not allow Terminal over it', async () => {
    await db.invoice.update({ where: { id: invoiceId }, data: { stripeCheckoutSessionId: 'cs_legacy' } })
    expect((await reserve(input('terminal'))).success).toBe(false)
    expect((await attempt()).providerId).toBe('cs_legacy')
  })
  it('rejects saving after the invoice balance changed and keeps uncertain attempt active', async () => {
    const first = await attempt()
    await db.invoice.update({ where: { id: invoiceId }, data: { outstandingCents: 0, status: 'paid' } })
    expect(await save(first, 'cs_after_payment')).toBe(false)
    expect((await db.invoice.findUniqueOrThrow({ where: { id: invoiceId } })).stripeCheckoutSessionId).toBeNull()
  })
})
