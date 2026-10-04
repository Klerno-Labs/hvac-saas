import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
if (!process.env.TEST_DATABASE_URL || !new URL(process.env.TEST_DATABASE_URL).pathname.endsWith('_test')) throw new Error('Dedicated test database required')
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL
const { db } = await import('@/lib/db')
const { auth } = await import('@/lib/auth')
const { updateInvoice } = await import('@/app/invoices/[invoiceId]/actions')
const { updateEstimate } = await import('@/app/estimates/[estimateId]/actions')
const { requestReview } = await import('@/app/jobs/[jobId]/review-actions')
const { submitReview } = await import('@/app/reviews/[token]/actions')
let org: string, user: string, customer: string, job: string
beforeAll(async () => {
  user = (await db.user.create({ data: { email: `release-${randomUUID()}@example.test` } })).id
  org = (await db.organization.create({ data: { name: 'Release concurrency fixture', subscriptionStatus: 'ACTIVE', plan: 'PRO' } })).id
  await db.organizationMember.create({ data: { userId: user, organizationId: org, role: 'owner' } })
  customer = (await db.customer.create({ data: { organizationId: org, firstName: 'Fixture' } })).id
  job = (await db.job.create({ data: { organizationId: org, customerId: customer, title: 'Test completed work', status: 'completed' } })).id
  vi.mocked(auth).mockResolvedValue({ user: { id: user, email: 'fixture@example.test' } } as never)
})
afterAll(async () => { if (org) await db.organization.delete({ where: { id: org } }); if (user) await db.user.delete({ where: { id: user } }); await db.$disconnect() })
describe('draft document overlapping saves', () => {
  it('invoice lines and totals stay aligned after eight overlapping edits', async () => {
    const invoice = await db.invoice.create({ data: { organizationId: org, jobId: job, customerId: customer, invoiceNumber: 'INV-RACE', descriptionOfWork: 'Original', status: 'draft' } })
    const results = await Promise.all(Array.from({ length: 8 }, (_, i) => updateInvoice(invoice.id, { descriptionOfWork: `Revision ${i}`, taxCents: i, lineItems: [{ name: `Item ${i}`, quantity: 2, unitPriceCents: 100 + i }] })))
    expect(results.some(r => r.success)).toBe(true)
    const saved = await db.invoice.findUniqueOrThrow({ where: { id: invoice.id }, include: { lineItems: true } })
    expect(saved.lineItems).toHaveLength(1)
    expect(saved.totalCents).toBe(saved.lineItems[0].lineTotalCents + saved.taxCents)
    expect(saved.outstandingCents).toBe(saved.totalCents)
    await db.invoice.update({ where: { id: invoice.id }, data: { status: 'sent' } })
    expect((await updateInvoice(invoice.id, { descriptionOfWork: 'Forbidden', taxCents: 0, lineItems: [{ name: 'Wrong', quantity: 1, unitPriceCents: 1 }] })).success).toBe(false)
  })
  it('estimate overlapping edits return recoverable conflicts and keep one line set', async () => {
    const estimate = await db.estimate.create({ data: { organizationId: org, jobId: job, estimateNumber: 'EST-RACE', scopeOfWork: 'Original', status: 'draft' } })
    const results = await Promise.all(Array.from({ length: 8 }, (_, i) => updateEstimate(estimate.id, { scopeOfWork: `Revision ${i}`, taxCents: i, lineItems: [{ name: `Item ${i}`, quantity: 3, unitPriceCents: 100 + i }] })))
    expect(results.some(r => r.success)).toBe(true)
    const saved = await db.estimate.findUniqueOrThrow({ where: { id: estimate.id }, include: { lineItems: true } })
    expect(saved.lineItems).toHaveLength(1)
    expect(saved.totalCents).toBe(saved.lineItems[0].lineTotalCents + saved.taxCents)
  })
})
describe('review capability concurrency', () => {
  it('overlapping review requests converge and only one submission is accepted', async () => {
    const links = await Promise.all(Array.from({ length: 8 }, () => requestReview(job)))
    expect(new Set(links.map(r => r.url)).size).toBe(1)
    expect(links[0].url).toBeTruthy()
    const review = await db.customerReview.findUniqueOrThrow({ where: { jobId: job } })
    const results = await Promise.all(Array.from({ length: 8 }, (_, i) => { const form = new FormData(); form.set('rating', String(i % 5 + 1)); form.set('comment', `Submission ${i}`); return submitReview(review.token, form) }))
    expect(results.filter(r => r.success)).toHaveLength(1)
    expect(results.filter(r => r.error)).toHaveLength(7)
  })
})

describe('pricebook retry and duplicate handling', () => {
  it('overlapping imports and repeated names produce one item with the final row price', async () => {
    const { importPriceBookItems } = await import('@/app/pricebook/import-actions')
    const csv = 'name,flatPrice\nUnique pressure item,10\nUnique pressure item,20'
    const results = await Promise.all([importPriceBookItems(csv), importPriceBookItems(csv)])
    expect(results.every(r => r.success)).toBe(true)
    const items = await db.priceBookItem.findMany({ where: { organizationId: org, name: 'Unique pressure item' } })
    expect(items).toHaveLength(1)
    expect(items[0].flatPriceCents).toBe(2000)
  })
})

describe('owner controls and safe unavailable integrations', () => {
  it('enforces ownership on every previously uncovered administration action', async () => {
    const { updateAccountingConfig, triggerAccountingSync } = await import('@/app/settings/accounting/actions')
    const { removeMember } = await import('@/app/settings/team/actions')
    const { updateCollectionsPolicy } = await import('@/app/settings/collections/actions')
    const { setTerminalEnabled } = await import('@/app/settings/stripe/actions')
    const member = await db.organizationMember.findFirstOrThrow({ where: { userId: user, organizationId: org } })
    const policy = { collectionsEnabled: true, collectionsOverdue1Days: 3, collectionsOverdue2Days: 7, collectionsFinalDays: 14 }
    await db.organizationMember.update({ where: { id: member.id }, data: { role: 'technician' } })
    try {
      for (const result of await Promise.all([updateAccountingConfig({ accountingProvider: 'quickbooks', accountingConnected: true }), triggerAccountingSync(), removeMember(member.id), updateCollectionsPolicy(policy), setTerminalEnabled(true)])) expect(result.success).toBe(false)
    } finally { await db.organizationMember.update({ where: { id: member.id }, data: { role: 'owner' } }) }
    expect((await updateAccountingConfig({ accountingProvider: 'quickbooks', accountingConnected: true })).success).toBe(false)
    expect((await triggerAccountingSync()).success).toBe(false)
    expect((await setTerminalEnabled(true)).success).toBe(false)
    expect((await setTerminalEnabled(false)).success).toBe(true)
    expect((await removeMember(member.id)).success).toBe(false)
    expect((await updateCollectionsPolicy({ ...policy, collectionsOverdue2Days: 2 })).success).toBe(false)
    expect((await updateCollectionsPolicy(policy)).success).toBe(true)
    const saved = await db.organization.findUniqueOrThrow({ where: { id: org } })
    expect(saved.collectionsEnabled).toBe(true)
    expect(saved.collectionsFinalDays).toBe(14)
    expect(saved.accountingConnected).toBe(false)
    expect(saved.stripeTerminalEnabled).toBe(false)
  })
})

describe('inventory input safety', () => {
  it('rejects malformed and out-of-range stock input without a write', async () => {
    const { createInventoryItem } = await import('@/app/inventory/new/actions')
    for (const [field, value] of [['quantityOnHand', '1.5'], ['quantityOnHand', '999999999999'], ['unitCost', '12oops']]) {
      const form = new FormData(); form.set('name', 'Must not persist'); form.set(field, value)
      expect((await createInventoryItem(form)).success).toBe(false)
    }
    expect(await db.inventoryItem.count({ where: { organizationId: org, name: 'Must not persist' } })).toBe(0)
  })
})
