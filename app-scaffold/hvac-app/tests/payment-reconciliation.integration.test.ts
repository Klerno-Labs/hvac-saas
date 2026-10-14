import { beforeAll, afterAll, describe, it, expect } from 'vitest'
import { randomUUID } from 'node:crypto'
if (!process.env.TEST_DATABASE_URL || !new URL(process.env.TEST_DATABASE_URL).pathname.endsWith('_test')) throw new Error('Dedicated TEST_DATABASE_URL required')
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL
const { db } = await import('@/lib/db')
const { reconcileConfirmedPayment } = await import('@/lib/payment-reconciliation')
let organizationId: string
let customerId: string
let jobId: string
beforeAll(async () => {
  const org = await db.organization.create({data: {name: 'Payment regression fixture', stripeConnectedAccountId: 'acct_fixture'}})
  organizationId = org.id
  const customer = await db.customer.create({data: {organizationId, firstName: 'Test'}})
  customerId = customer.id
  const job = await db.job.create({data: {organizationId, customerId, title: 'Test service'}})
  jobId = job.id
})
afterAll(async () => {
  await db.organization.delete({where: {id: organizationId}})
  await db.$disconnect()
})
async function fixture() {
  const invoice = await db.invoice.create({data: {organizationId, customerId, jobId, invoiceNumber: randomUUID(), status: 'sent', totalCents: 12500, outstandingCents: 12500}})
  await db.collectionAttempt.create({data: {organizationId, invoiceId: invoice.id, stage: 'overdue_1', status: 'created'}})
  return {invoiceId: invoice.id, organizationId, connectedAccountId: 'acct_fixture', paymentIntentId: `pi_${randomUUID()}`, amountCents: 12500, currency: 'usd', method: 'checkout'}
}
describe('settled payments against PostgreSQL', () => {
  it.each(['created', 'failed', 'retry', 'sending', 'partial', 'review', 'sent', 'dismissed'])('stops outstanding %s collection work without erasing delivery evidence', async status => {
    const input = await fixture()
    const notes = JSON.stringify({ version: 1, email: { status: 'retry', attempts: 1 }, sms: { status: 'accepted', attempts: 1, providerId: 'SM_preserved' } })
    await db.collectionAttempt.updateMany({ where: { invoiceId: input.invoiceId }, data: { status, notes } })
    await reconcileConfirmedPayment(input)
    const saved = await db.collectionAttempt.findFirstOrThrow({ where: { invoiceId: input.invoiceId } })
    expect(saved.status).toBe(['sent', 'dismissed'].includes(status) ? status : 'skipped')
    expect(saved.notes).toBe(notes)
  })
  it.each([true, false, undefined])('stores only explicit webhook mode as durable payment evidence: %s', async livemode => {
    const input = { ...await fixture(), ...(typeof livemode === 'boolean' ? { livemode } : {}) }
    await reconcileConfirmedPayment(input)
    const record = await db.auditLog.findFirstOrThrow({ where: { organizationId, eventType: 'payment.recorded', targetId: input.invoiceId } })
    expect(record.metadata).toMatchObject({ connectedAccountId: 'acct_fixture', paymentIntentId: input.paymentIntentId, amountCents: 12500 })
    if (typeof livemode === 'boolean') expect(record.metadata).toMatchObject({ livemode })
    else expect(record.metadata).not.toHaveProperty('livemode')
  })
  it('serializes simultaneous duplicate deliveries into one ledger entry', async () => {
    const input = await fixture()
    await Promise.all([reconcileConfirmedPayment(input), reconcileConfirmedPayment(input)])
    const invoice = await db.invoice.findUniqueOrThrow({where: {id: input.invoiceId}})
    expect(invoice.status).toBe('paid')
    expect(invoice.outstandingCents).toBe(0)
    expect(await db.payment.count({where: {invoiceId: input.invoiceId}})).toBe(1)
    expect(await db.collectionAttempt.count({where: {invoiceId: input.invoiceId, status: 'created'}})).toBe(0)
  })
  it.each([
    {organizationId: 'another-org'}, {connectedAccountId: 'acct_other'}, {connectedAccountId: undefined},
    {amountCents: 100}, {amountCents: 15000}, {amountCents: 0}, {amountCents: 1.5}, {currency: 'eur'},
  ])('rejects mismatches without changing the ledger: %j', async mismatch => {
    const input = await fixture()
    await expect(reconcileConfirmedPayment({...input, ...mismatch})).rejects.toThrow()
    expect((await db.invoice.findUniqueOrThrow({where: {id: input.invoiceId}})).status).toBe('sent')
    expect(await db.payment.count({where: {invoiceId: input.invoiceId}})).toBe(0)
  })
  it('does not silently accept a second payment against an already paid invoice', async () => {
    const input = await fixture()
    await reconcileConfirmedPayment(input)
    await expect(reconcileConfirmedPayment({...input, paymentIntentId: `pi_${randomUUID()}`})).rejects.toThrow(/reconciliation required/)
  })
})

describe('document numbering under concurrent requests', () => {
 it('allocates distinct sequential numbers for simultaneous creates', async () => {
  const { nextDocumentNumber } = await import('@/lib/document-number')
  const create = () => db.$transaction(async tx => {
   const invoiceNumber = await nextDocumentNumber(tx, organizationId, 'invoice')
   return tx.invoice.create({data:{organizationId,customerId,jobId,invoiceNumber}})
  })
  const invoices = await Promise.all(Array.from({length:10}, create))
  expect(new Set(invoices.map(i=>i.invoiceNumber)).size).toBe(10)
  await db.invoice.delete({where:{id:invoices.find(i=>i.invoiceNumber==='INV-0002')!.id}})
  expect((await create()).invoiceNumber).toBe('INV-0011')
 })
})
