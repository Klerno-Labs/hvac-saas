import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'node:crypto'

const context = vi.hoisted(() => ({ userId: '', referralCode: '', organizationId: '' }))
vi.mock('@/lib/auth', () => ({ auth: async () => ({ user: { id: context.userId, email: 'onboarding@example.test' } }) }))
vi.mock('next/headers', () => ({ cookies: async () => ({ get: (key: string) => key === 'fc_ref' ? { value: context.referralCode } : undefined, delete: vi.fn() }) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/require-admin', () => ({ requireAdmin: async () => ({ authorized: true, context: { userId: context.userId, organizationId: context.organizationId, userEmail: 'onboarding@example.test' } }) }))

if (!process.env.TEST_DATABASE_URL || !new URL(process.env.TEST_DATABASE_URL).pathname.endsWith('_test')) throw new Error('Dedicated TEST_DATABASE_URL required')
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL
const { db } = await import('@/lib/db')
const { createOrganization } = await import('@/app/onboarding/actions')
const { updateOrganizationTrade } = await import('@/app/settings/trade/actions')
let referringOrgId: string

function form(trade = 'plumbing') {
  const data = new FormData()
  data.set('name', 'Onboarding concurrency fixture')
  data.set('tradeType', trade)
  return data
}

beforeAll(async () => {
  context.userId = (await db.user.create({ data: { email: `onboarding-${randomUUID()}@example.test` } })).id
  context.referralCode = `ref-${randomUUID()}`
  referringOrgId = (await db.organization.create({ data: { name: 'Referring fixture', referralCode: context.referralCode } })).id
})
afterAll(async () => {
  if (context.organizationId) await db.organization.delete({ where: { id: context.organizationId } })
  await db.organization.delete({ where: { id: referringOrgId } })
  await db.activityEvent.deleteMany({ where: { userId: context.userId } })
  await db.user.delete({ where: { id: context.userId } })
  await db.$disconnect()
})

describe('onboarding and trade changes against PostgreSQL', () => {
  it('serializes concurrent onboarding into one organization, owner membership, and referral credit', async () => {
    const results = await Promise.all(Array.from({ length: 5 }, () => createOrganization(form())))
    expect(results.every(result => result.success)).toBe(true)
    const ids = results.map(result => result.success ? result.organizationId : '')
    expect(new Set(ids).size).toBe(1)
    context.organizationId = ids[0]
    expect(await db.organizationMember.count({ where: { userId: context.userId } })).toBe(1)
    expect(await db.organization.count({ where: { referredByOrgId: referringOrgId } })).toBe(1)
    expect((await db.organization.findUniqueOrThrow({ where: { id: referringOrgId } })).referralCredits).toBe(1)
    expect(await db.activityEvent.count({ where: { userId: context.userId, eventName: 'organization_onboarding_completed' } })).toBe(1)
  })

  it('reuses a completed onboarding attempt without changing its trade or creating new records', async () => {
    expect(await createOrganization(form('electrical'))).toEqual({ success: true, organizationId: context.organizationId })
    expect((await db.organization.findUniqueOrThrow({ where: { id: context.organizationId } })).tradeType).toBe('plumbing')
    expect((await db.organization.findUniqueOrThrow({ where: { id: referringOrgId } })).referralCredits).toBe(1)
  })

  it('serializes concurrent trade changes so audit records describe the actual previous state', async () => {
    const results = await Promise.all(['electrical', 'pest-control'].map(tradeType => updateOrganizationTrade({ tradeType })))
    expect(results).toEqual([{ success: true }, { success: true }])
    const records = await db.auditLog.findMany({ where: { organizationId: context.organizationId, eventType: 'organization_trade_changed' } })
    const changes = records.map(record => record.metadata as { from: string; to: string })
    expect(changes).toHaveLength(2)
    const first = changes.find(change => change.from === 'plumbing')!
    expect(first).toBeDefined()
    const second = changes.find(change => change.from === first.to)!
    expect(second).toBeDefined()
    expect((await db.organization.findUniqueOrThrow({ where: { id: context.organizationId } })).tradeType).toBe(second.to)
  })
})
