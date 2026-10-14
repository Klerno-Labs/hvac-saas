import { beforeEach, describe, expect, it, vi } from 'vitest'
const captured = vi.hoisted(() => ({ config: null as unknown as { callbacks: { jwt: (input: { token: Record<string, unknown>; user?: Record<string, unknown> }) => Promise<Record<string, unknown> | null> } } }))
vi.mock('next-auth', () => ({ default: (config: typeof captured.config) => { captured.config = config; return { handlers: {}, auth: vi.fn(), signIn: vi.fn(), signOut: vi.fn() } } }))
vi.mock('next-auth/providers/github', () => ({ default: () => ({ id: 'github' }) }))
vi.mock('next-auth/providers/credentials', () => ({ default: () => ({ id: 'credentials' }) }))
vi.mock('@auth/prisma-adapter', () => ({ PrismaAdapter: () => ({}) }))
vi.mock('@/lib/db', () => ({ db: { user: { findUnique: vi.fn() } } }))
vi.mock('@/lib/rate-limit', () => ({ limit: vi.fn(async () => ({ allowed: true })), RL: { login: {} } }))
import '@/lib/auth'
import { db } from '@/lib/db'
import { credentialVersion } from '@/lib/credential-version'
beforeEach(() => { vi.mocked(db.user.findUnique).mockResolvedValue({ hashedPassword: 'hash-one' } as never) })
describe('credential-bound sessions', () => {
  it('records a version on sign-in without exposing the password hash', async () => {
    const token = await captured.config.callbacks.jwt({ token: {}, user: { id: 'user1', credentialVersion: credentialVersion('hash-one') } })
    expect(token).toMatchObject({ id: 'user1', credentialVersion: credentialVersion('hash-one') })
    expect(JSON.stringify(token)).not.toContain('hash-one')
  })
  it('accepts an unchanged session', async () => {
    expect(await captured.config.callbacks.jwt({ token: { id: 'user1', credentialVersion: credentialVersion('hash-one') } })).not.toBeNull()
  })
  it('rejects sessions after a password change', async () => {
    expect(await captured.config.callbacks.jwt({ token: { id: 'user1', credentialVersion: credentialVersion('old-hash') } })).toBeNull()
  })
  it('rejects a login authenticated just before a password reset', async () => {
    expect(await captured.config.callbacks.jwt({ token: {}, user: { id: 'user1', credentialVersion: credentialVersion('old-hash') } })).toBeNull()
  })
  it('requires legacy sessions to sign in again', async () => expect(await captured.config.callbacks.jwt({ token: { id: 'user1' } })).toBeNull())
  it('rejects a deleted account', async () => {
    vi.mocked(db.user.findUnique).mockResolvedValue(null)
    expect(await captured.config.callbacks.jwt({ token: { id: 'user1', credentialVersion: credentialVersion('hash-one') } })).toBeNull()
  })
})
