import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('@/lib/db', () => ({ db: { $queryRaw: vi.fn() } }))
import { db } from '@/lib/db'
import { GET } from '@/app/api/health/route'
beforeEach(() => {
  vi.stubEnv('DATABASE_URL', 'postgresql://fixture/test')
  vi.stubEnv('AUTH_SECRET', 'a-local-test-secret-with-at-least-32-characters')
  vi.stubEnv('AUTH_URL', 'https://app.example.test')
  vi.stubEnv('STRIPE_SECRET_KEY', '')
  vi.mocked(db.$queryRaw).mockResolvedValue([{ '?column?': 1 }])
})
afterEach(() => vi.unstubAllEnvs())
describe('application health', () => {
  it('stays available before optional integrations are configured and does not cache', async () => {
    const response = await GET()
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toMatchObject({ ok: true, checks: { stripe: { status: 'not_configured' } } })
  })
  it('fails when the database is unavailable', async () => {
    vi.mocked(db.$queryRaw).mockRejectedValue(new Error('database unavailable'))
    expect((await GET()).status).toBe(503)
  })
  it('fails when the auth secret is the shipped placeholder', async () => {
    vi.stubEnv('AUTH_SECRET', 'replace-me-with-openssl-rand-base64-32')
    expect((await GET()).status).toBe(503)
  })
})
