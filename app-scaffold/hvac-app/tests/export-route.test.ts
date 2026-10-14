import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ admin: vi.fn(), customers: vi.fn(), jobs: vi.fn(), invoices: vi.fn(), payments: vi.fn(), audit: vi.fn() }))
vi.mock('@/lib/require-admin', () => ({ requireAdmin: mocks.admin }))
vi.mock('@/lib/audit', () => ({ logAudit: mocks.audit }))
vi.mock('@/lib/db', () => ({ db: { customer: { findMany: mocks.customers }, job: { findMany: mocks.jobs }, invoice: { findMany: mocks.invoices }, payment: { findMany: mocks.payments } } }))
import { GET } from '@/app/api/settings/export/route'

const request = (query = 'entity=invoices') => new Request(`https://example.test/api/settings/export?${query}`)
beforeEach(() => {
  vi.resetAllMocks()
  mocks.admin.mockResolvedValue({ authorized: true, context: { organizationId: 'server-org', userId: 'owner', userEmail: 'owner@example.test' } })
  for (const find of [mocks.customers, mocks.jobs, mocks.invoices, mocks.payments]) find.mockResolvedValue([])
})

describe('accounting export route', () => {
  it('requires owner authorization before reading records', async () => {
    mocks.admin.mockResolvedValue({ authorized: false, error: 'Owner required' })
    expect((await GET(request())).status).toBe(403)
    expect(mocks.invoices).not.toHaveBeenCalled()
    expect(mocks.audit).not.toHaveBeenCalled()
  })

  it.each([
    ['customers', 'customers'], ['jobs', 'jobs'], ['invoices', 'invoices'], ['payments', 'payments'],
  ] as const)('scopes and deterministically bounds %s exports using the server organization', async (entity, key) => {
    const response = await GET(request(`entity=${entity}&organizationId=attacker-org`))
    expect(response.status).toBe(200)
    expect(mocks[key]).toHaveBeenCalledWith({ where: { organizationId: 'server-org', ...(entity === 'customers' ? { deletedAt: null } : {}) }, orderBy: { id: 'asc' }, take: 50001 })
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(response.headers.get('content-disposition')).toContain('attachment;')
  })

  it.each(['csv', 'json'])('rejects oversized %s exports without a partial download or completion audit', async (format) => {
    mocks.invoices.mockResolvedValue(Array(50001).fill({ id: 'invoice' }))
    const response = await GET(request(`entity=invoices&format=${format}`))
    expect(response.status).toBe(413)
    expect(await response.json()).toMatchObject({ code: 'EXPORT_TOO_LARGE', limit: 50000 })
    expect(response.headers.get('content-disposition')).toBeNull()
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(mocks.audit).not.toHaveBeenCalled()
  })

  it('allows an export at the exact record limit', async () => {
    mocks.payments.mockResolvedValue(Array(50000).fill({ id: 'payment', amountCents: 12500, currency: 'usd', status: 'succeeded' }))
    const response = await GET(request('entity=payments&format=json'))
    expect(response.status).toBe(200)
    expect((await response.json()).length).toBe(50000)
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ metadata: { entity: 'payments', format: 'json', rowCount: 50000 } }))
  })

  it('preserves raw text in private JSON exports while CSV neutralizes formulas', async () => {
    mocks.customers.mockResolvedValue([{ id: 'customer', firstName: '=1+1' }])
    const json = await GET(request('entity=customers&format=json'))
    expect(json.headers.get('cache-control')).toBe('private, no-store')
    expect((await json.json())[0].firstName).toBe('=1+1')
    const csv = await GET(request('entity=customers'))
    expect(await csv.text()).toContain("'=1+1")
  })
})
