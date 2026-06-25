import { describe, it, expect, beforeEach, vi } from 'vitest'
import { resetRateLimitStore, RL } from '@/lib/rate-limit'

vi.mock('next-auth', () => ({
  default: () => ({ handlers: {}, auth: () => null, signIn: () => null, signOut: () => null }),
}))
vi.mock('next-auth/providers/github', () => ({ default: () => ({ id: 'github' }) }))
vi.mock('next-auth/providers/credentials', () => ({ default: () => ({ id: 'credentials' }) }))
vi.mock('@auth/prisma-adapter', () => ({ PrismaAdapter: () => ({}) }))

vi.mock('@/lib/db', () => ({
  db: {
    user: { findUnique: vi.fn() },
  },
}))

vi.mock('bcryptjs', () => ({
  default: { compare: vi.fn().mockResolvedValue(false) },
}))

const { db } = await import('@/lib/db')
const { authorizeCredentials } = await import('@/lib/auth')

describe('credentials login rate limit (authorizeCredentials)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetRateLimitStore()
    ;(db.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'u1',
      email: 'attacked@example.com',
      name: 'Victim',
      hashedPassword: '$2a$12$irrelevant',
    })
  })

  it('allows up to RL.login.max attempts then short-circuits without a DB lookup', async () => {
    const email = 'ATTACKED@example.com'
    const max = RL.login.max

    for (let i = 0; i < max; i++) {
      const res = await authorizeCredentials({ email, password: 'wrong' })
      expect(res).toBeNull()
    }

    expect(db.user.findUnique).toHaveBeenCalledTimes(max)

    const overLimit = await authorizeCredentials({ email, password: 'wrong' })
    expect(overLimit).toBeNull()
    expect(db.user.findUnique).toHaveBeenCalledTimes(max)
  })

  it('rate-limits per email, so a different email is unaffected', async () => {
    for (let i = 0; i < RL.login.max; i++) {
      await authorizeCredentials({ email: 'first@example.com', password: 'wrong' })
    }

    const other = await authorizeCredentials({ email: 'second@example.com', password: 'wrong' })
    expect(other).toBeNull()
    const calls = (db.user.findUnique as ReturnType<typeof vi.fn>).mock.calls
    expect(calls.some((c) => (c[0] as { where: { email: string } }).where.email === 'second@example.com')).toBe(true)
  })

  it('returns null without rate-limiting when credentials are missing', async () => {
    const res = await authorizeCredentials({ password: 'x' })
    expect(res).toBeNull()
    expect(db.user.findUnique).not.toHaveBeenCalled()
  })
})
