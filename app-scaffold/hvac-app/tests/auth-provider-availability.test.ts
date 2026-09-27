import { afterEach, describe, expect, it, vi } from 'vitest'
const captured = vi.hoisted(() => ({ providers: [] as { id: string }[] }))
vi.mock('next-auth', () => ({ default: (config: { providers: { id: string }[] }) => { captured.providers = config.providers; return { handlers: {}, auth: vi.fn(), signIn: vi.fn(), signOut: vi.fn() } } }))
vi.mock('next-auth/providers/github', () => ({ default: () => ({ id: 'github' }) }))
vi.mock('next-auth/providers/credentials', () => ({ default: () => ({ id: 'credentials' }) }))
vi.mock('@auth/prisma-adapter', () => ({ PrismaAdapter: () => ({}) }))
vi.mock('@/lib/db', () => ({ db: {} }))
afterEach(() => vi.unstubAllEnvs())
describe('available sign-in providers', () => {
  it.each([['', '', false], ['id', '', false], ['', 'secret', false], ['id', 'secret', true]])('GitHub is enabled only with both credentials', async (id, secret, enabled) => {
    vi.resetModules(); vi.stubEnv('AUTH_GITHUB_ID', id); vi.stubEnv('AUTH_GITHUB_SECRET', secret)
    await import('@/lib/auth')
    expect(captured.providers.some(p => p.id === 'github')).toBe(enabled)
    expect(captured.providers.some(p => p.id === 'credentials')).toBe(true)
  })
})
