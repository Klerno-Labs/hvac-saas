import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ transaction: vi.fn(), findFirst: vi.fn(), create: vi.fn(), setCookie: vi.fn(), hash: vi.fn(), trackEvent: vi.fn() }))
vi.mock('@/lib/db', () => ({ db: { $transaction: mocks.transaction, user: { findFirst: mocks.findFirst, create: mocks.create } } }))
vi.mock('@/lib/events', () => ({ trackEvent: mocks.trackEvent }))
vi.mock('next/headers', () => ({ cookies: async () => ({ set: mocks.setCookie }) }))
vi.mock('bcryptjs', () => ({ default: { hash: mocks.hash } }))
import { signup } from '@/app/signup/actions'

const form = (trade: string) => {
  const data = new FormData()
  data.set('name', 'Test Owner')
  data.set('email', 'owner@example.test')
  data.set('password', 'ExamplePassword123!')
  data.set('trade', trade)
  return data
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.transaction.mockImplementation(async fn => fn({ user: { create: mocks.create } }))
  mocks.findFirst.mockResolvedValue(null)
  mocks.create.mockResolvedValue({ id: 'user-1' })
  mocks.hash.mockResolvedValue('hashed-test-password')
})

describe('signup trade handoff', () => {
  it('normalizes account emails and checks legacy mixed-case addresses before creation', async () => {
    const input = form('plumbing')
    input.set('email', '  OWNER@EXAMPLE.TEST  ')
    expect((await signup(input)).success).toBe(true)
    expect(mocks.findFirst).toHaveBeenCalledWith({ where: { email: { equals: 'owner@example.test', mode: 'insensitive' } } })
    expect(mocks.create).toHaveBeenCalledWith({ data: expect.objectContaining({ email: 'owner@example.test' }) })
  })

  it('preserves a supported selected trade for onboarding with a bounded HttpOnly cookie', async () => {
    expect(await signup(form('plumbing'))).toEqual({ success: true })
    expect(mocks.setCookie).toHaveBeenCalledWith('fc_trade', 'plumbing', expect.objectContaining({ httpOnly: true, sameSite: 'lax', maxAge: 604800, path: '/' }))
  })

  it('preserves Pro trial intent without starting a paid subscription', async () => {
    const input = form('hvac'); input.set('plan', 'pro')
    expect(await signup(input)).toEqual({ success: true })
    expect(mocks.setCookie).toHaveBeenCalledWith('fc_plan', 'pro', expect.objectContaining({ httpOnly: true, sameSite: 'lax' }))
  })

  it('uses Starter for invalid plan values and keeps account events inside the transaction', async () => {
    const input = form('hvac'); input.set('plan', 'enterprise')
    expect(await signup(input)).toEqual({ success: true })
    expect(mocks.setCookie).toHaveBeenCalledWith('fc_plan', 'starter', expect.any(Object))
    expect(mocks.trackEvent).toHaveBeenCalledWith(expect.objectContaining({ eventName: 'user_signed_up' }), expect.objectContaining({ user: expect.any(Object) }))
  })

  it('returns a recoverable failure and no preference cookies if account creation fails', async () => {
    mocks.create.mockRejectedValue(new Error('sensitive database error'))
    const result = await signup(form('hvac'))
    expect(result).toMatchObject({ success: false })
    expect(JSON.stringify(result)).not.toContain('sensitive')
    expect(mocks.setCookie).not.toHaveBeenCalled()
  })

  it('does not persist arbitrary query values as trade configuration', async () => {
    await signup(form('arbitrary-trade'))
    expect(mocks.setCookie).toHaveBeenCalledWith('fc_trade', 'hvac', expect.any(Object))
  })

  it('does not change the preference when signup fails', async () => {
    mocks.findFirst.mockResolvedValue({ id: 'existing-user' })
    expect((await signup(form('electrical'))).success).toBe(false)
    expect(mocks.setCookie).not.toHaveBeenCalled()
    expect(mocks.create).not.toHaveBeenCalled()
  })
})
