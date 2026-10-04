import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ access: vi.fn() }))
vi.mock('@/lib/mutation-access', () => ({ requireMutationAccess: mocks.access }))
if (!process.env.TEST_DATABASE_URL || !new URL(process.env.TEST_DATABASE_URL).pathname.endsWith('_test')) throw new Error('Dedicated TEST_DATABASE_URL required')
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL
const { db } = await import('@/lib/db')
const { getEstimateCatalog } = await import('@/lib/estimate-catalog')
const { addEstimateLineItem, catalogItemToLineItem } = await import('@/lib/pricebook-to-lineitem')
const { createEstimate } = await import('@/app/estimates/new/actions')
let organizationId: string
let otherOrganizationId: string
let jobId: string
let serviceId: string
let partId: string
beforeAll(async () => {
  organizationId = (await db.organization.create({ data: { name: 'Estimate catalog fixture' } })).id
  otherOrganizationId = (await db.organization.create({ data: { name: 'Other catalog fixture' } })).id
  const customer = await db.customer.create({ data: { organizationId, firstName: 'Fixture' } })
  jobId = (await db.job.create({ data: { organizationId, customerId: customer.id, title: 'Inspection' } })).id
  serviceId = (await db.priceBookItem.create({ data: { organizationId, name: 'Service inspection', flatPriceCents: 14995, costCents: 1000 } })).id
  partId = (await db.inventoryItem.create({ data: { organizationId, name: 'Replacement part', sellPriceCents: 3901, unitCostCents: 1000, quantityOnHand: 7 } })).id
  await db.priceBookItem.createMany({ data: [
    { organizationId, name: 'Deleted service', flatPriceCents: 12300, deletedAt: new Date() },
    { organizationId: otherOrganizationId, name: 'Private other service', flatPriceCents: 12300 },
  ] })
  await db.inventoryItem.create({ data: { organizationId: otherOrganizationId, name: 'Private other part', sellPriceCents: 12300 } })
  mocks.access.mockResolvedValue({ authorized: true, context: { organizationId, userId: 'fixture-owner' } })
})
afterAll(async () => {
  await db.organization.deleteMany({ where: { id: { in: [organizationId, otherOrganizationId] } } })
  await db.$disconnect()
})

describe('saved price book to draft estimate against PostgreSQL', () => {
  it('excludes deleted services and both catalogs of unrelated organizations', async () => {
    const catalog = await getEstimateCatalog({ organizationId, role: 'owner' })
    expect(catalog.map(item => [item.id, item.source, item.unitPriceCents])).toEqual([
      [serviceId, 'service', 14995], [partId, 'inventory', 3901],
    ])
    expect(catalog.every(item => !('costCents' in item) && !('unitCostCents' in item) && !('quantityOnHand' in item))).toBe(true)
  })

  it('saves exact service and part prices into a draft without changing stock or the catalog', async () => {
    const catalog = await getEstimateCatalog({ organizationId, role: 'owner' })
    let lineItems = [{ name: '', description: '', quantity: 1, unitPriceCents: 0 }]
    for (const item of catalog) lineItems = addEstimateLineItem(lineItems, catalogItemToLineItem(item))
    const result = await createEstimate({ jobId, scopeOfWork: 'Inspect and replace part', taxCents: 125, lineItems, aiDraftUsed: false })
    expect(result.success).toBe(true)
    if (!result.success) throw new Error(result.error)
    const saved = await db.estimate.findUniqueOrThrow({ where: { id: result.estimateId }, include: { lineItems: { orderBy: { sortOrder: 'asc' } } } })
    expect(saved).toMatchObject({ organizationId, status: 'draft', subtotalCents: 18896, taxCents: 125, totalCents: 19021 })
    expect(saved.lineItems.map(item => [item.name, item.quantity, item.unitPriceCents, item.lineTotalCents])).toEqual([
      ['Service inspection', 1, 14995, 14995], ['Replacement part', 1, 3901, 3901],
    ])
    expect(await db.inventoryItem.findUniqueOrThrow({ where: { id: partId } })).toMatchObject({ quantityOnHand: 7, sellPriceCents: 3901 })
    expect(await db.priceBookItem.findUniqueOrThrow({ where: { id: serviceId } })).toMatchObject({ flatPriceCents: 14995 })
  })
})
