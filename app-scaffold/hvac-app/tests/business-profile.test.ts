import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ auth: vi.fn(), member: vi.fn(), transaction: vi.fn(), lock: vi.fn(), find: vi.fn(), update: vi.fn(), audit: vi.fn(), revalidate: vi.fn() }))
vi.mock('@/lib/auth', () => ({ auth: mocks.auth }))
vi.mock('@/lib/db', () => ({ db: { organizationMember: { findFirst: mocks.member }, $transaction: mocks.transaction } }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }))
import { businessProfileSchema } from '@/lib/validations/business-profile'
import { saveBusinessProfile } from '@/app/setup/business/actions'

const input = { name: '  Clear Water Plumbing  ', tradeType: 'plumbing', timezone: 'America/Chicago', phone: ' 555-1234 ', email: 'office@example.test' }
beforeEach(() => {
  vi.resetAllMocks()
  mocks.auth.mockResolvedValue({ user: { id: 'owner-one', email: 'owner@example.test' } })
  mocks.member.mockResolvedValue({ organizationId: 'server-org', role: 'owner', organization: { subscriptionStatus: 'ACTIVE', trialEndsAt: null, readOnlyAt: null } })
  mocks.find.mockResolvedValue({ name: 'Old Name', tradeType: 'hvac', timezone: null, email: null, phone: null })
  mocks.transaction.mockImplementation(fn => fn({ $queryRaw: mocks.lock, organization: { findUniqueOrThrow: mocks.find, update: mocks.update }, auditLog: { create: mocks.audit } }))
})

describe('business profile validation', () => {
  it.each(['', 'Not/A_Timezone', '+05:00'])('rejects a missing or invalid IANA timezone %s', timezone => {
    expect(businessProfileSchema.safeParse({ ...input, timezone }).success).toBe(false)
  })
  it.each(['UTC', 'America/Chicago', 'Pacific/Auckland', 'US/Central'])('accepts supported IANA timezone %s', timezone => {
    expect(businessProfileSchema.safeParse({ ...input, timezone }).success).toBe(true)
  })
  it('rejects whitespace names, unknown trades, and invalid email', () => {
    for (const change of [{ name: ' ' }, { tradeType: 'bogus' }, { email: 'not-email' }]) expect(businessProfileSchema.safeParse({ ...input, ...change }).success).toBe(false)
  })
})

describe('business profile mutation', () => {
  it('blocks unauthenticated writes', async () => {
    mocks.auth.mockResolvedValue(null)
    expect((await saveBusinessProfile(input)).success).toBe(false)
    expect(mocks.transaction).not.toHaveBeenCalled()
  })
  it.each(['technician', 'office_admin', 'dispatcher', 'csr', 'member'])('rejects nonowner %s', async role => {
    mocks.member.mockResolvedValue({ organizationId: 'server-org', role, organization: { subscriptionStatus: 'ACTIVE' } })
    expect((await saveBusinessProfile(input)).success).toBe(false)
    expect(mocks.transaction).not.toHaveBeenCalled()
  })
  it.each([{ subscriptionStatus: 'CANCELED' }, { subscriptionStatus: 'ACTIVE', readOnlyAt: new Date() }, { subscriptionStatus: 'TRIALING', trialEndsAt: new Date('2000-01-01') }])('honors workspace mutation restrictions %s', async organization => {
    mocks.member.mockResolvedValue({ organizationId: 'server-org', role: 'owner', organization })
    expect((await saveBusinessProfile(input)).success).toBe(false)
    expect(mocks.transaction).not.toHaveBeenCalled()
  })
  it('rejects malformed input before opening a write transaction', async () => {
    expect((await saveBusinessProfile({ ...input, timezone: '' })).success).toBe(false)
    expect(mocks.transaction).not.toHaveBeenCalled()
  })
  it('uses only server tenant identity and allowed profile fields with a transactional audit', async () => {
    expect(await saveBusinessProfile({ ...input, organizationId: 'victim-org', stripeChargesEnabled: true, subscriptionStatus: 'ACTIVE' })).toEqual({ success: true })
    expect(mocks.update).toHaveBeenCalledWith({ where: { id: 'server-org' }, data: { name: 'Clear Water Plumbing', tradeType: 'plumbing', timezone: 'America/Chicago', phone: '555-1234', email: 'office@example.test' } })
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ organizationId: 'server-org', actorId: 'owner-one', eventType: 'business_profile_updated' }) }))
    expect(mocks.lock.mock.invocationCallOrder[0]).toBeLessThan(mocks.find.mock.invocationCallOrder[0])
    expect(mocks.revalidate).toHaveBeenCalledWith('/', 'layout')
  })
  it('does not report success or revalidate when the transaction fails', async () => {
    mocks.transaction.mockRejectedValue(new Error('audit insert failed'))
    expect((await saveBusinessProfile(input)).success).toBe(false)
    expect(mocks.revalidate).not.toHaveBeenCalled()
  })
  it('does not write or audit unchanged profile details', async () => {
    mocks.find.mockResolvedValue({ name: 'Clear Water Plumbing', tradeType: 'plumbing', timezone: 'America/Chicago', phone: '555-1234', email: 'office@example.test' })
    expect(await saveBusinessProfile(input)).toEqual({ success: true })
    expect(mocks.update).not.toHaveBeenCalled()
    expect(mocks.audit).not.toHaveBeenCalled()
  })
})
