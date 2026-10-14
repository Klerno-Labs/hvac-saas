import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
vi.mock('@/lib/db', () => ({ db: {
  portalToken: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
  customer: { findFirst: vi.fn() },
} }))
import { db } from '@/lib/db'
import { generateTokenString, defaultTokenExpiry, validatePortalToken, getOrCreatePortalUrl } from '@/lib/portal'

const token = 'a'.repeat(64)
const now = new Date('2026-09-27T14:00:00Z')
const valid = () => ({
  token, customerId: 'customer1', organizationId: 'org1', revokedAt: null,
  expiresAt: new Date(now.getTime() + 60_000),
  customer: { id: 'customer1', organizationId: 'org1', deletedAt: null, firstName: 'Customer', lastName: null },
  organization: { id: 'org1', name: 'Business' },
})
beforeEach(() => {
  vi.resetAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(now)
  vi.mocked(db.portalToken.findUnique).mockResolvedValue(valid() as never)
  vi.mocked(db.customer.findFirst).mockResolvedValue({ id: 'customer1' } as never)
  vi.stubEnv('APP_URL', 'https://fieldclose.example.test')
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs() })

describe('portal customer ownership', () => {
  it('accepts a current capability for its own active customer', async () => {
    expect(await validatePortalToken(token)).toEqual({ customerId: 'customer1', organizationId: 'org1', customerName: 'Customer', organizationName: 'Business' })
  })
  it.each(['', 'not-a-token', 'a'.repeat(63), 'a'.repeat(65), 'A'.repeat(64)])('rejects malformed capabilities before storage: %s', async value => {
    expect(await validatePortalToken(value)).toBeNull()
    expect(db.portalToken.findUnique).not.toHaveBeenCalled()
  })
  it.each(['expired', 'boundary', 'revoked', 'deleted', 'mismatched-org', 'missing'])('rejects a %s capability', async state => {
    const row = valid()
    if (state === 'expired') row.expiresAt = new Date(now.getTime() - 1)
    if (state === 'boundary') row.expiresAt = now
    if (state === 'revoked') Object.assign(row, { revokedAt: now })
    if (state === 'deleted') Object.assign(row.customer, { deletedAt: now })
    if (state === 'mismatched-org') row.customer.organizationId = 'other-org'
    vi.mocked(db.portalToken.findUnique).mockResolvedValue(state === 'missing' ? null : row as never)
    expect(await validatePortalToken(token)).toBeNull()
  })
  it('does not reuse or issue a token for a missing, deleted, or other-organization customer', async () => {
    vi.mocked(db.customer.findFirst).mockResolvedValue(null)
    await expect(getOrCreatePortalUrl('org1', 'customer1')).rejects.toThrow('Customer not found')
    expect(db.customer.findFirst).toHaveBeenCalledWith({ where: { id: 'customer1', organizationId: 'org1', deletedAt: null }, select: { id: true } })
    expect(db.portalToken.findFirst).not.toHaveBeenCalled()
    expect(db.portalToken.create).not.toHaveBeenCalled()
  })
  it('reuses a current token only after validating the customer', async () => {
    vi.mocked(db.portalToken.findFirst).mockResolvedValue({ token } as never)
    expect(await getOrCreatePortalUrl('org1', 'customer1')).toBe(`https://fieldclose.example.test/portal/${token}`)
    expect(db.portalToken.create).not.toHaveBeenCalled()
  })
  it('creates a token bound to the validated customer and organization', async () => {
    vi.mocked(db.portalToken.findFirst).mockResolvedValue(null)
    expect(await getOrCreatePortalUrl('org1', 'customer1')).toMatch(/^https:\/\/fieldclose\.example\.test\/portal\/[a-f0-9]{64}$/)
    expect(db.portalToken.create).toHaveBeenCalledWith({ data: { token: expect.stringMatching(/^[a-f0-9]{64}$/), organizationId: 'org1', customerId: 'customer1', expiresAt: defaultTokenExpiry() } })
  })
})

describe('generateTokenString', () => {
  it('returns a 64-character hex string', () => {
    const token = generateTokenString()
    expect(token).toMatch(/^[0-9a-f]{64}$/)
  })

  it('generates unique tokens', () => {
    const tokens = new Set(Array.from({ length: 100 }, () => generateTokenString()))
    expect(tokens.size).toBe(100)
  })
})

describe('defaultTokenExpiry', () => {
  it('returns a date 30 days in the future', () => {
    const now = Date.now()
    const expiry = defaultTokenExpiry()
    const diffDays = (expiry.getTime() - now) / (1000 * 60 * 60 * 24)
    expect(diffDays).toBeGreaterThan(29.9)
    expect(diffDays).toBeLessThan(30.1)
  })
})
