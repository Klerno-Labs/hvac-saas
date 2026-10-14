import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('@/lib/db', () => {
  const client = { user: { findFirst: vi.fn() }, passwordResetToken: { updateMany: vi.fn(), create: vi.fn() }, $queryRaw: vi.fn(), $transaction: vi.fn() }
  client.$transaction.mockImplementation(async fn => fn(client))
  return { db: client }
})
vi.mock('@/lib/email', () => ({ sendPasswordResetEmail: vi.fn() }))
vi.mock('next/headers', () => ({ headers: vi.fn(async () => new Headers()) }))
vi.mock('@/lib/rate-limit', () => ({ limit: vi.fn(), RL: { passwordReset: {} }, extractIp: vi.fn(() => '127.0.0.1') }))
import { db } from '@/lib/db'
import { limit } from '@/lib/rate-limit'
import { sendPasswordResetEmail } from '@/lib/email'
import { requestPasswordReset } from '@/app/forgot-password/actions'
const form = (email = '  CUSTOMER@EXAMPLE.TEST  ') => { const data = new FormData(); data.set('email', email); return data }
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('RESEND_API_KEY', 'test-key')
  vi.mocked(limit).mockResolvedValue({ allowed: true, retryAfterSeconds: 0 })
  vi.mocked(db.user.findFirst).mockResolvedValue({ id: 'user1', email: 'customer@example.test' } as never)
  vi.mocked(sendPasswordResetEmail).mockResolvedValue({ success: true, id: 'message1' })
})
afterEach(() => vi.unstubAllEnvs())
describe('password reset request', () => {
  it('normalizes the lookup and stores only a digest of the email token', async () => {
    expect(await requestPasswordReset(form())).toEqual({ success: true })
    expect(db.user.findFirst).toHaveBeenCalledWith({ where: { email: { equals: 'customer@example.test', mode: 'insensitive' } } })
    const resetUrl = vi.mocked(sendPasswordResetEmail).mock.calls[0][0].resetUrl
    const token = new URL(resetUrl).searchParams.get('token')!
    const stored = vi.mocked(db.passwordResetToken.create).mock.calls[0][0].data.token
    expect(token).toMatch(/^[a-f0-9]{64}$/)
    expect(stored).toMatch(/^sha256:[a-f0-9]{64}$/)
    expect(stored).not.toContain(token)
  })
  it('returns the rate-limit error instead of fabricated success', async () => {
    vi.mocked(limit).mockResolvedValue({ allowed: false, retryAfterSeconds: 60 })
    expect(await requestPasswordReset(form())).toMatchObject({ success: false, error: expect.stringContaining('Too many attempts') })
    expect(db.user.findFirst).not.toHaveBeenCalled()
  })
  it('reports globally missing email delivery before account lookup', async () => {
    vi.stubEnv('RESEND_API_KEY', '')
    expect(await requestPasswordReset(form())).toMatchObject({ success: false, error: expect.stringContaining('temporarily unavailable') })
    expect(db.user.findFirst).not.toHaveBeenCalled()
  })
  it('does not reveal whether an email address exists', async () => {
    vi.mocked(db.user.findFirst).mockResolvedValue(null)
    expect(await requestPasswordReset(form())).toEqual({ success: true })
    expect(sendPasswordResetEmail).not.toHaveBeenCalled()
  })
  it('invalidates the reset capability when delivery is rejected while preserving the generic response', async () => {
    vi.mocked(sendPasswordResetEmail).mockResolvedValue({ success: false, error: 'Unavailable' })
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await requestPasswordReset(form())).toEqual({ success: true })
    expect(db.passwordResetToken.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { token: expect.stringMatching(/^sha256:/), usedAt: null } }))
    expect(error).toHaveBeenCalledWith('Password reset email delivery failed')
    error.mockRestore()
  })
  it('validates malformed addresses before calling storage or delivery', async () => {
    expect((await requestPasswordReset(form('invalid'))).success).toBe(false)
    expect(db.user.findFirst).not.toHaveBeenCalled()
  })
})
