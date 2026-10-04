import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  revalidatePath: vi.fn(),
  transaction: vi.fn(),
  lock: vi.fn(),
  findUniqueOrThrow: vi.fn(),
  update: vi.fn(),
  auditCreate: vi.fn(),
  eventCreate: vi.fn(),
}))

vi.mock('@/lib/require-admin', () => ({ requireAdmin: mocks.requireAdmin }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock('@/lib/db', () => ({ db: { $transaction: mocks.transaction } }))
import { updateOrganizationTrade } from '@/app/settings/trade/actions'

beforeEach(() => {
  vi.resetAllMocks()
  mocks.requireAdmin.mockResolvedValue({ authorized: true, context: { organizationId: 'server-org', userId: 'owner-1', userEmail: 'owner@example.test' } })
  mocks.findUniqueOrThrow.mockResolvedValue({ tradeType: 'hvac' })
  mocks.transaction.mockImplementation((fn) => fn({
    $queryRaw: mocks.lock,
    organization: { findUniqueOrThrow: mocks.findUniqueOrThrow, update: mocks.update },
    auditLog: { create: mocks.auditCreate },
    activityEvent: { create: mocks.eventCreate },
  }))
})

describe('organization trade settings', () => {
  it('requires owner authorization before any database access', async () => {
    mocks.requireAdmin.mockResolvedValue({ authorized: false, error: 'Only organization owners can perform this action' })
    expect((await updateOrganizationTrade({ tradeType: 'plumbing' })).success).toBe(false)
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  it('rejects an invalid trade without writing', async () => {
    expect((await updateOrganizationTrade({ tradeType: 'not-a-trade' })).success).toBe(false)
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  it('derives the organization from the session and records the change atomically', async () => {
    expect(await updateOrganizationTrade({ organizationId: 'attacker-org', tradeType: 'electrical' })).toEqual({ success: true })
    expect(mocks.lock).toHaveBeenCalled()
    expect(mocks.lock.mock.invocationCallOrder[0]).toBeLessThan(mocks.findUniqueOrThrow.mock.invocationCallOrder[0])
    expect(mocks.update).toHaveBeenCalledWith({ where: { id: 'server-org' }, data: { tradeType: 'electrical' } })
    expect(mocks.auditCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ organizationId: 'server-org', actorId: 'owner-1', metadata: { from: 'hvac', to: 'electrical' } }) }))
    expect(mocks.eventCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ organizationId: 'server-org', eventName: 'organization_trade_updated' }) }))
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/', 'layout')
  })

  it('does not create duplicate records when the trade is unchanged', async () => {
    expect(await updateOrganizationTrade({ tradeType: 'hvac' })).toEqual({ success: true })
    expect(mocks.update).not.toHaveBeenCalled()
    expect(mocks.auditCreate).not.toHaveBeenCalled()
  })

  it('returns a recoverable failure if the transaction cannot commit', async () => {
    mocks.transaction.mockRejectedValue(new Error('database unavailable'))
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect((await updateOrganizationTrade({ tradeType: 'plumbing' })).success).toBe(false)
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
    spy.mockRestore()
  })
})
