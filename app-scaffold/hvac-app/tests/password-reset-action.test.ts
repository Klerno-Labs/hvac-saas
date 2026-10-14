import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('@/lib/db', () => ({ db: { passwordResetToken: { findFirst: vi.fn() } } }))
vi.mock('@/lib/password-reset', () => ({ consumePasswordReset: vi.fn(), resetTokenDigest: (token: string) => `sha256:${token}` }))
vi.mock('bcryptjs', () => ({ default: { hash: vi.fn(async () => 'new-password-hash') } }))
vi.mock('next/headers', () => ({ headers: vi.fn(async () => new Headers()) }))
vi.mock('@/lib/rate-limit', () => ({ limit: vi.fn(async () => ({ allowed: true, retryAfterSeconds: 0 })), RL: { passwordReset: {} }, extractIp: vi.fn() }))
import { db } from '@/lib/db'
import bcrypt from 'bcryptjs'
import { consumePasswordReset } from '@/lib/password-reset'
import { resetPassword } from '@/app/reset-password/actions'
const form = () => { const data = new FormData(); data.set('token', 'a'.repeat(64)); data.set('password', 'New password example'); return data }
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(db.passwordResetToken.findFirst).mockResolvedValue({ id: 'reset1' } as never)
  vi.mocked(consumePasswordReset).mockResolvedValue(true)
})
describe('reset password action', () => {
  it('rejects random or expired reset capabilities before expensive hashing', async () => {
    vi.mocked(db.passwordResetToken.findFirst).mockResolvedValue(null)
    expect((await resetPassword(form())).success).toBe(false)
    expect(bcrypt.hash).not.toHaveBeenCalled()
  })
  it('reports a concurrent token claim as failure rather than claiming a password change', async () => {
    vi.mocked(consumePasswordReset).mockResolvedValue(false)
    expect((await resetPassword(form())).success).toBe(false)
  })
  it('reports success only after the atomic password change commits', async () => {
    expect(await resetPassword(form())).toEqual({ success: true })
    expect(consumePasswordReset).toHaveBeenCalledWith('a'.repeat(64), 'new-password-hash')
  })
})
