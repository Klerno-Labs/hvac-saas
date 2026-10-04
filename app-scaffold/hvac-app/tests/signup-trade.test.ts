import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ transaction: vi.fn(), findFirst: vi.fn(), create: vi.fn(), setCookie: vi.fn(), hash: vi.fn(), trackEvent: vi.fn(), headers: vi.fn() }))
vi.mock('@/lib/db', () => ({ db: { $transaction: mocks.transaction, user: { findFirst: mocks.findFirst, create: mocks.create } } }))
vi.mock('@/lib/events', () => ({ trackEvent: mocks.trackEvent }))
vi.mock('next/headers', () => ({ cookies: async () => ({ set: mocks.setCookie }), headers: mocks.headers }))
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
  mocks.headers.mockResolvedValue(new Headers())
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

  it('attaches only validated coarse context to the successful signup event', async () => {
    const input = form('hvac')
    input.set('acquisition', JSON.stringify({ version: 1, landingPath: '/resources', source: 'search_google', capturedAt: Date.now() - 1000 }))
    expect(await signup(input)).toEqual({ success: true })
    expect(mocks.trackEvent).toHaveBeenCalledWith({ userId: 'user-1', eventName: 'user_signed_up', entityType: 'user', entityId: 'user-1', metadataJson: { acquisition: { version: 1, landingPath: '/resources', source: 'search_google' } } }, expect.any(Object))
    expect(mocks.setCookie.mock.calls.map(([name]) => name)).toEqual(['fc_trade', 'fc_plan'])
  })

  it.each(['{', 'x'.repeat(513), JSON.stringify({ version: 1, landingPath: '/portal/secret', source: 'social', capturedAt: Date.now() }), JSON.stringify({ version: 1, landingPath: '/resources', source: 'social', capturedAt: Date.now(), email: 'private@example.test' })])('ignores malformed attribution without changing signup: %s', async acquisition => {
    const input = form('plumbing'); input.set('acquisition', acquisition)
    expect(await signup(input)).toEqual({ success: true })
    expect(mocks.trackEvent.mock.calls[0][0]).not.toHaveProperty('metadataJson')
  })

  it.each(['dnt', 'sec-gpc'])('honors server privacy header %s even if a context is submitted', async header => {
    mocks.headers.mockResolvedValue(new Headers({ [header]: '1' }))
    const input = form('hvac'); input.set('acquisition', JSON.stringify({ version: 1, landingPath: '/', source: 'social', capturedAt: Date.now() - 1000 }))
    expect(await signup(input)).toEqual({ success: true })
    expect(mocks.trackEvent.mock.calls[0][0]).not.toHaveProperty('metadataJson')
  })

  it('does not fail signup when optional request context is unavailable', async () => {
    mocks.headers.mockRejectedValue(new Error('Unavailable'))
    const input = form('hvac'); input.set('acquisition', JSON.stringify({ version: 1, landingPath: '/', source: 'social', capturedAt: Date.now() - 1000 }))
    expect(await signup(input)).toEqual({ success: true })
    expect(mocks.trackEvent.mock.calls[0][0]).not.toHaveProperty('metadataJson')
  })

  it('does not record an attributed conversion for existing accounts', async () => {
    mocks.findFirst.mockResolvedValue({ id: 'existing-user' })
    const input = form('hvac'); input.set('acquisition', JSON.stringify({ version: 1, landingPath: '/', source: 'social', capturedAt: Date.now() - 1000 }))
    expect((await signup(input)).success).toBe(false)
    expect(mocks.trackEvent).not.toHaveBeenCalled()
  })
})
