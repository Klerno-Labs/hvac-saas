import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
const context = vi.hoisted(() => ({ userId: '', organizationId: '', authorized: true }))
vi.mock('@/lib/mutation-access', () => ({ requireMutationAccess: async () => context.authorized ? { authorized: true, context: { organizationId: context.organizationId, userId: context.userId } } : { authorized: false, error: 'Not authorized' } }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
if (!process.env.TEST_DATABASE_URL || !new URL(process.env.TEST_DATABASE_URL).pathname.endsWith('_test')) throw new Error('Dedicated TEST_DATABASE_URL required')
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL
const { db } = await import('@/lib/db')
const { saveCustomerImport, reviewCustomerImport } = await import('@/app/settings/import/customer-actions')
let secondOrg: string
const input = { csv: 'Name,Phone,Email\nFirst,5550001,first@example.test\nNo Email,5550002,', mapping: { firstName: 'Name', phone: 'Phone', email: 'Email' } }
beforeAll(async () => {
  context.userId = (await db.user.create({ data: { email: `import-${randomUUID()}@example.test` } })).id
  context.organizationId = (await db.organization.create({ data: { name: 'Import test' } })).id
  secondOrg = (await db.organization.create({ data: { name: 'Other import test' } })).id
})
afterAll(async () => {
  await db.organization.deleteMany({ where: { id: { in: [context.organizationId, secondOrg] } } })
  await db.user.delete({ where: { id: context.userId } }); await db.$disconnect()
})
describe('customer import transaction and replay safety', () => {
  it('previews without creating customer records or receipts', async () => {
    expect(await reviewCustomerImport(input)).toMatchObject({ success: true, report: { created: 2 } })
    expect(await db.customer.count({ where: { organizationId: context.organizationId } })).toBe(0)
  })
  it('serializes simultaneous imports into one complete batch, including rows with no email', async () => {
    const results = await Promise.all(Array.from({ length: 5 }, () => saveCustomerImport(input)))
    expect(results.every(result => result.success)).toBe(true)
    expect(results.filter(result => result.success && result.report.alreadyImported)).toHaveLength(4)
    expect(await db.customer.count({ where: { organizationId: context.organizationId } })).toBe(2)
    expect(await db.activityEvent.count({ where: { organizationId: context.organizationId, eventName: 'customer_import_completed' } })).toBe(1)
    expect(await db.auditLog.count({ where: { organizationId: context.organizationId, eventType: 'customer_import_completed' } })).toBe(1)
  })
  it('ignores a supplied tenant and does not reuse another tenant’s receipt', async () => {
    const firstOrg = context.organizationId; context.organizationId = secondOrg
    const result = await saveCustomerImport({ ...input, organizationId: firstOrg } as typeof input)
    expect(result).toMatchObject({ success: true, report: { created: 2 } })
    expect(await db.customer.count({ where: { organizationId: secondOrg } })).toBe(2)
    context.organizationId = firstOrg
  })
  it('rejects denied access and bad mappings before any write', async () => {
    context.authorized = false
    expect(await saveCustomerImport(input)).toEqual({ success: false, error: 'Not authorized' })
    expect(await reviewCustomerImport(input)).toEqual({ success: false, error: 'Not authorized' })
    context.authorized = true
    expect(await saveCustomerImport({ ...input, mapping: {} })).toMatchObject({ success: false })
    expect(await db.customer.count({ where: { organizationId: context.organizationId } })).toBe(2)
  })
})
