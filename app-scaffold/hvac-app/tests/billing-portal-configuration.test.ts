import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mock = vi.hoisted(() => ({ auth: vi.fn(), stripe: vi.fn(), portal: vi.fn(), customer: vi.fn(), update: vi.fn() }))
vi.mock('@/lib/session', () => ({ requireAuth: mock.auth }))
vi.mock('@/lib/stripe', () => ({ getStripe: mock.stripe }))
vi.mock('@/lib/db', () => ({ db: { organization: { update: mock.update } } }))

import { billingPortalConfigurationId } from '@/lib/billing-portal'
import { POST } from '@/app/api/billing/portal/route'

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('STRIPE_BILLING_PORTAL_CONFIGURATION_ID', '')
  vi.stubEnv('APP_URL', 'https://fieldclose.example.test')
  mock.auth.mockResolvedValue({ organizationId: 'org_fieldclose', role: 'owner', organization: { stripeCustomerId: 'cus_fieldclose', name: 'FieldClose fixture' } })
  mock.portal.mockResolvedValue({ url: 'https://billing.stripe.com/fixture' })
  mock.stripe.mockReturnValue({ billingPortal: { sessions: { create: mock.portal } }, customers: { create: mock.customer } })
})
afterEach(() => vi.unstubAllEnvs())

describe('application-specific billing portal configuration', () => {
  it.each([undefined, '', '  \n'])('preserves Stripe’s default when the optional configuration is %j', value => {
    vi.stubEnv('STRIPE_BILLING_PORTAL_CONFIGURATION_ID', value)
    expect(billingPortalConfigurationId()).toBeUndefined()
  })

  it.each(['price_wrong', 'bpc_', 'bpc_a/b', 'bpc_a\nb', 'https://example.test', 'bpc_' + 'a'.repeat(100)])('rejects malformed configuration %j without reflecting it', value => {
    vi.stubEnv('STRIPE_BILLING_PORTAL_CONFIGURATION_ID', value)
    expect(() => billingPortalConfigurationId()).toThrow('Billing portal configuration is invalid')
    try { billingPortalConfigurationId() } catch (error) { expect((error as Error).message).not.toContain(value) }
  })

  it('passes the trimmed server configuration and authenticated customer to the portal', async () => {
    vi.stubEnv('STRIPE_BILLING_PORTAL_CONFIGURATION_ID', '  bpc_FieldCloseLive \n')
    const response = await POST()
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ url: 'https://billing.stripe.com/fixture' })
    expect(mock.portal).toHaveBeenCalledWith({ customer: 'cus_fieldclose', configuration: 'bpc_FieldCloseLive', return_url: 'https://fieldclose.example.test/settings/billing' })
    expect(mock.customer).not.toHaveBeenCalled()
  })

  it('omits the optional parameter when no application configuration is set', async () => {
    expect((await POST()).status).toBe(200)
    expect(mock.portal.mock.calls[0][0]).not.toHaveProperty('configuration')
  })

  it('fails closed before provider calls or customer writes for a malformed configuration', async () => {
    vi.stubEnv('STRIPE_BILLING_PORTAL_CONFIGURATION_ID', 'invalid_fixture_value')
    mock.auth.mockResolvedValue({ organizationId: 'org_fieldclose', role: 'owner', organization: { stripeCustomerId: null } })
    const response = await POST()
    expect(response.status).toBe(503)
    expect(JSON.stringify(await response.json())).not.toContain('invalid_fixture_value')
    expect(mock.stripe).not.toHaveBeenCalled()
    expect(mock.update).not.toHaveBeenCalled()
  })

  it('still rejects non-owner access before reading payment configuration', async () => {
    mock.auth.mockResolvedValue({ organizationId: 'org_fieldclose', role: 'tech', organization: { stripeCustomerId: 'cus_fieldclose' } })
    vi.stubEnv('STRIPE_BILLING_PORTAL_CONFIGURATION_ID', 'invalid_fixture_value')
    expect((await POST()).status).toBe(403)
    expect(mock.stripe).not.toHaveBeenCalled()
  })
})
