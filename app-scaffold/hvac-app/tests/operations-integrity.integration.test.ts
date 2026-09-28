import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@react-pdf/renderer', () => ({ renderToBuffer: vi.fn(async () => Buffer.from('%PDF-fixture')) }))
vi.mock('@/lib/pdf/invoice-pdf', () => ({ InvoicePdf: vi.fn() }))
vi.mock('@/lib/pdf/estimate-pdf', () => ({ EstimatePdf: vi.fn() }))
if (!process.env.TEST_DATABASE_URL || !new URL(process.env.TEST_DATABASE_URL).pathname.endsWith('_test')) throw new Error('Dedicated TEST_DATABASE_URL required')
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL
const { db } = await import('@/lib/db')
const { auth } = await import('@/lib/auth')
const { recordPartUsage } = await import('@/app/jobs/[jobId]/inventory-actions')
const { generateDueRecurringJobs } = await import('@/lib/recurring-generation')
let userId: string
const organizations: string[] = []
const users: string[] = []
beforeAll(async () => {
  userId = (await db.user.create({ data: { email: `operations-${randomUUID()}@example.test` } })).id
  users.push(userId)
  vi.mocked(auth).mockResolvedValue({ user: { id: userId } } as never)
})
afterAll(async () => {
  for (const id of organizations.reverse()) await db.organization.delete({ where: { id } })
  await db.user.deleteMany({ where: { id: { in: users } } })
  await db.$disconnect()
})
async function fixture(status: 'ACTIVE' | 'CANCELED' = 'ACTIVE') {
  const org = await db.organization.create({ data: { name: 'Operations regression', subscriptionStatus: status } })
  organizations.push(org.id)
  const customer = await db.customer.create({ data: { organizationId: org.id, firstName: 'Fixture' } })
  return { organizationId: org.id, customerId: customer.id }
}

describe('stock concurrency against PostgreSQL', () => {
  it('lets only one worker consume the final item, with a matching usage record', async () => {
    const base = await fixture()
    await db.organizationMember.create({ data: { organizationId: base.organizationId, userId, role: 'owner' } })
    const job = await db.job.create({ data: { ...base, title: 'Concurrent repair' } })
    const item = await db.inventoryItem.create({ data: { organizationId: base.organizationId, name: 'Last part', quantityOnHand: 1 } })
    const use = () => {
      const data = new FormData(); data.set('inventoryItemId', item.id); data.set('quantity', '1')
      return recordPartUsage(job.id, data)
    }
    const attempts = await Promise.all(Array.from({ length: 8 }, use))
    expect(attempts.filter(result => result.success)).toHaveLength(1)
    expect((await db.inventoryItem.findUniqueOrThrow({ where: { id: item.id } })).quantityOnHand).toBe(0)
    expect(await db.inventoryUsage.count({ where: { inventoryItemId: item.id } })).toBe(1)
  })
})

describe('recurring generation against PostgreSQL', () => {
  it('overlapping runs create one job, one counted visit and one activity event', async () => {
    const base = await fixture()
    const due = new Date('2026-09-01T12:00:00Z')
    const schedule = await db.recurringJob.create({ data: { ...base, title: 'Recurring inspection', frequency: 'monthly', nextDueDate: due } })
    const member = await db.membership.create({ data: { ...base, recurringJobId: schedule.id } })
    await Promise.all(Array.from({ length: 8 }, () => generateDueRecurringJobs(new Date('2026-09-02T12:00:00Z'))))
    expect(await db.job.count({ where: { organizationId: base.organizationId } })).toBe(1)
    expect((await db.membership.findUniqueOrThrow({ where: { id: member.id } })).visitsUsed).toBe(1)
    expect((await db.recurringJob.findUniqueOrThrow({ where: { id: schedule.id } })).nextDueDate.toISOString()).toBe('2026-10-01T12:00:00.000Z')
    expect(await db.activityEvent.count({ where: { organizationId: base.organizationId, eventName: 'membership_visit_generated' } })).toBe(1)
  })
  it.each(['CANCELED', 'frozen', 'paused', 'deleted-customer'] as const)('skips %s schedules without consuming a visit', async state => {
    const base = await fixture(state === 'CANCELED' ? 'CANCELED' : 'ACTIVE')
    const due = new Date('2026-09-01T12:00:00Z')
    const schedule = await db.recurringJob.create({ data: { ...base, title: 'Must not generate', frequency: 'monthly', nextDueDate: due } })
    if (state === 'frozen') await db.organization.update({ where: { id: base.organizationId }, data: { readOnlyAt: new Date() } })
    if (state === 'deleted-customer') await db.customer.update({ where: { id: base.customerId }, data: { deletedAt: new Date() } })
    const member = await db.membership.create({ data: { ...base, recurringJobId: schedule.id, status: state === 'paused' ? 'paused' : 'active' } })
    await generateDueRecurringJobs(new Date('2026-09-02T12:00:00Z'))
    expect(await db.job.count({ where: { organizationId: base.organizationId } })).toBe(0)
    expect((await db.membership.findUniqueOrThrow({ where: { id: member.id } })).visitsUsed).toBe(0)
    expect((await db.recurringJob.findUniqueOrThrow({ where: { id: schedule.id } })).nextDueDate).toEqual(due)
  })
})


describe('assigned technician document access against PostgreSQL', () => {
  it('can download issued assigned documents, but not another job or any draft', async () => {
    const { NextRequest } = await import('next/server')
    const { GET: invoicePdf } = await import('@/app/api/invoices/[invoiceId]/pdf/route')
    const { GET: estimatePdf } = await import('@/app/api/estimates/[estimateId]/pdf/route')
    const base = await fixture()
    const reader = await db.user.create({ data: { email: `reader-${randomUUID()}@example.test` } })
    users.push(reader.id)
    await db.organizationMember.create({ data: { organizationId: base.organizationId, userId: reader.id, role: 'technician' } })
    vi.mocked(auth).mockResolvedValue({ user: { id: reader.id } } as never)
    for (const [assignment, status, expected] of [
      [reader.id, 'sent', 200], [null, 'sent', 404], [reader.id, 'draft', 404],
    ] as const) {
      const job = await db.job.create({ data: { organizationId: base.organizationId, customerId: base.customerId, title: 'Permission fixture', assignedUserId: assignment } })
      const invoice = await db.invoice.create({ data: { organizationId: base.organizationId, customerId: base.customerId, jobId: job.id, invoiceNumber: randomUUID(), status } })
      const estimate = await db.estimate.create({ data: { organizationId: base.organizationId, jobId: job.id, estimateNumber: randomUUID(), status } })
      expect((await invoicePdf(new NextRequest('http://localhost/api/pdf'), { params: Promise.resolve({ invoiceId: invoice.id }) })).status).toBe(expected)
      expect((await estimatePdf(new NextRequest('http://localhost/api/pdf'), { params: Promise.resolve({ estimateId: estimate.id }) })).status).toBe(expected)
    }
  })
})
