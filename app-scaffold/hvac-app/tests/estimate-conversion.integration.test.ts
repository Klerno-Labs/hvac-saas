import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
if (!process.env.TEST_DATABASE_URL || !new URL(process.env.TEST_DATABASE_URL).pathname.endsWith('_test')) throw new Error('Dedicated TEST_DATABASE_URL required')
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL
const { db } = await import('@/lib/db')
const { convertAcceptedEstimate } = await import('@/lib/estimate-conversion')
let organizationId: string
let otherOrganizationId: string
let jobId: string
beforeAll(async () => {
  const org = await db.organization.create({ data: { name: 'Estimate conversion fixture' } })
  organizationId = org.id
  otherOrganizationId = (await db.organization.create({ data: { name: 'Unrelated fixture' } })).id
  const customer = await db.customer.create({ data: { organizationId, firstName: 'Test' } })
  jobId = (await db.job.create({ data: { organizationId, customerId: customer.id, title: 'Service' } })).id
})
afterAll(async () => {
  await db.organization.deleteMany({ where: { id: { in: [organizationId, otherOrganizationId] } } })
  await db.$disconnect()
})
async function fixture() {
  return db.estimate.create({ data: {
    organizationId, jobId, estimateNumber: `EST-${randomUUID()}`, status: 'accepted', scopeOfWork: 'Approved equipment service',
    notes: 'Bring replacement filter', terms: 'Due on completion', acceptedAt: new Date(), decisionByName: 'Customer',
    subtotalCents: 25000, taxCents: 1250, totalCents: 26250,
    lineItems: { create: [
      { name: 'Part', description: 'Replacement filter', quantity: 1, unitPriceCents: 5000, lineTotalCents: 5000, sortOrder: 0 },
      { name: 'Labor', quantity: 2, unitPriceCents: 10000, lineTotalCents: 20000, sortOrder: 1 },
    ] },
  } })
}
const convert = (estimateId: string, orgId = organizationId) => convertAcceptedEstimate({ estimateId, organizationId: orgId, userId: 'fixture-user' })
describe('approved estimate conversion against PostgreSQL', () => {
  it('converts once across concurrent requests while preserving amounts and approval', async () => {
    const estimate = await fixture()
    const results = await Promise.all(Array.from({ length: 6 }, () => convert(estimate.id)))
    expect(new Set(results.map(result => result.invoiceId)).size).toBe(1)
    expect(results.filter(result => result.created)).toHaveLength(1)
    const invoice = await db.invoice.findUniqueOrThrow({ where: { id: results[0].invoiceId }, include: { lineItems: { orderBy: { sortOrder: 'asc' } } } })
    expect(invoice).toMatchObject({ organizationId, jobId, sourceEstimateId: estimate.id, status: 'draft', subtotalCents: 25000, taxCents: 1250, totalCents: 26250, outstandingCents: 26250, sentAt: null, dueDate: null })
    expect(invoice.lineItems.map(item => [item.name, item.quantity, item.unitPriceCents, item.lineTotalCents])).toEqual([['Part', 1, 5000, 5000], ['Labor', 2, 10000, 20000]])
    expect(await db.estimate.findUnique({ where: { id: estimate.id } })).toMatchObject({ status: 'accepted', decisionByName: 'Customer', totalCents: 26250 })
    expect(await db.activityEvent.count({ where: { entityId: invoice.id, eventName: 'invoice_created' } })).toBe(1)
    expect(await db.auditLog.count({ where: { targetId: estimate.id, eventType: 'estimate.converted_to_invoice' } })).toBe(1)
  })
  it.each(['draft', 'sent', 'declined'])('does not invoice a %s estimate', async status => {
    const estimate = await fixture()
    await db.estimate.update({ where: { id: estimate.id }, data: { status } })
    await expect(convert(estimate.id)).rejects.toThrow('Accept the estimate')
    expect(await db.invoice.count({ where: { sourceEstimateId: estimate.id } })).toBe(0)
  })
  it('rejects a target belonging to another organization', async () => {
    const estimate = await fixture()
    await expect(convert(estimate.id, otherOrganizationId)).rejects.toThrow('not found')
    expect(await db.invoice.count({ where: { sourceEstimateId: estimate.id } })).toBe(0)
  })
  it('rejects tampered historical totals instead of silently changing an approved price', async () => {
    const estimate = await fixture()
    await db.estimate.update({ where: { id: estimate.id }, data: { totalCents: 25000 } })
    await expect(convert(estimate.id)).rejects.toThrow('totals do not match')
    expect(await db.invoice.count({ where: { sourceEstimateId: estimate.id } })).toBe(0)
  })
  it('blocks paid deposits until they can be credited safely', async () => {
    const estimate = await fixture()
    await db.estimate.update({ where: { id: estimate.id }, data: { depositStatus: 'paid', depositPaidAt: new Date() } })
    await expect(convert(estimate.id)).rejects.toThrow('deposit or payment')
    expect(await db.invoice.count({ where: { sourceEstimateId: estimate.id } })).toBe(0)
  })
  it('does not create a second invoice when the first has been voided', async () => {
    const estimate = await fixture()
    const first = await convert(estimate.id)
    await db.invoice.update({ where: { id: first.invoiceId }, data: { status: 'void' } })
    expect(await convert(estimate.id)).toEqual({ invoiceId: first.invoiceId, created: false })
  })
  it('keeps distinct document numbers when different estimates convert together', async () => {
    const estimates = await Promise.all([fixture(), fixture(), fixture()])
    const results = await Promise.all(estimates.map(estimate => convert(estimate.id)))
    const invoices = await db.invoice.findMany({ where: { id: { in: results.map(result => result.invoiceId) } } })
    expect(new Set(invoices.map(invoice => invoice.invoiceNumber)).size).toBe(3)
  })
})
