import { describe, it, expect, beforeEach, vi } from 'vitest'

// --- Mocks -----------------------------------------------------------------

const session = vi.hoisted(() => ({ requireAuth: vi.fn() }))
vi.mock('@/lib/session', () => session)

const db = vi.hoisted(() => ({ organization: { update: vi.fn() } }))
vi.mock('@/lib/db', () => ({ db }))

const mockCustomersCreate = vi.fn()
const mockPortalCreate = vi.fn()
vi.mock('@/lib/stripe', () => ({
  getStripe: () => ({
    customers: { create: mockCustomersCreate },
    billingPortal: { sessions: { create: mockPortalCreate } },
  }),
}))

const { POST } = await import('@/app/api/billing/portal/route')

beforeEach(() => {
  vi.clearAllMocks()
  process.env.APP_URL = 'http://localhost:3000'
})

describe('POST /api/billing/portal (e)', () => {
  it('returns { url } for an org that already has a stripeCustomerId', async () => {
    session.requireAuth.mockResolvedValue({
      organizationId: 'org_1',
      organization: { id: 'org_1', name: 'Acme HVAC', email: 'a@b.co', stripeCustomerId: 'cus_existing' },
    })
    mockPortalCreate.mockResolvedValue({ url: 'https://billing.stripe.com/session_xyz' })

    const res = await POST()
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json).toEqual({ url: 'https://billing.stripe.com/session_xyz' })
    expect(mockCustomersCreate).not.toHaveBeenCalled()
    expect(mockPortalCreate).toHaveBeenCalledWith({
      customer: 'cus_existing',
      return_url: 'http://localhost:3000/settings/billing',
    })
    // No customer persistence needed when one already exists.
    expect(db.organization.update).not.toHaveBeenCalled()
  })

  it('creates + persists a stripeCustomerId when missing, scoped to the session org', async () => {
    session.requireAuth.mockResolvedValue({
      organizationId: 'org_1',
      organization: { id: 'org_1', name: 'Acme HVAC', email: 'a@b.co', stripeCustomerId: null },
    })
    mockCustomersCreate.mockResolvedValue({ id: 'cus_new' })
    mockPortalCreate.mockResolvedValue({ url: 'https://billing.stripe.com/session_new' })

    const res = await POST()
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json).toEqual({ url: 'https://billing.stripe.com/session_new' })
    // Customer created with org-scoped metadata; never trusts a body orgId.
    expect(mockCustomersCreate).toHaveBeenCalledWith({
      name: 'Acme HVAC',
      email: 'a@b.co',
      metadata: { organizationId: 'org_1' },
    })
    // Persisted against the session org only.
    expect(db.organization.update).toHaveBeenCalledWith({
      where: { id: 'org_1' },
      data: { stripeCustomerId: 'cus_new' },
    })
    expect(mockPortalCreate).toHaveBeenCalledWith({
      customer: 'cus_new',
      return_url: 'http://localhost:3000/settings/billing',
    })
  })
})
