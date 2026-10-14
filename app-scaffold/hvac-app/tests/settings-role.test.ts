import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ requireAuth: vi.fn(), members: vi.fn(), invites: vi.fn() }))
vi.mock('@/lib/session', () => ({ requireAuth: mocks.requireAuth }))
vi.mock('@/lib/db', () => ({ db: { organizationMember: { findMany: mocks.members }, teamInvite: { findMany: mocks.invites } } }))
vi.mock('@/lib/sms', () => ({ isTwilioConfigured: () => false }))
vi.mock('@/app/settings/team-section', () => ({ TeamSection: 'TeamSection' }))
vi.mock('@/app/settings/stripe-connect', () => ({ StripeConnectSection: 'StripeConnectSection' }))
vi.mock('@/app/settings/collections-settings', () => ({ CollectionsSettingsSection: 'CollectionsSettingsSection' }))
vi.mock('@/app/settings/accounting-settings', () => ({ AccountingSettingsSection: 'AccountingSettingsSection' }))
vi.mock('@/app/settings/trade-settings', () => ({ TradeSettingsSection: 'TradeSettingsSection' }))
vi.mock('@/components/ui/card', () => ({ Card: 'section', CardHeader: 'header', CardContent: 'div', CardTitle: 'h2', CardDescription: 'p' }))
vi.mock('@/components/ui/button', () => ({ buttonVariants: () => 'button' }))
vi.mock('next/link', () => ({ default: 'a' }))
import SettingsPage from '@/app/settings/page'

const organization = { name: 'Test service company', tradeType: 'hvac', stripeConnectedAccountId: 'acct_private', plan: 'PRO', subscriptionStatus: 'ACTIVE' }
beforeEach(() => {
  vi.resetAllMocks()
  mocks.members.mockResolvedValue([])
  mocks.invites.mockResolvedValue([{ id: 'invite-1', token: 'private-invitation-token' }])
})

describe('settings read permissions', () => {
  it.each(['technician', 'dispatcher', 'office_admin', 'csr', 'member'])('does not query or serialize invitation tokens for %s', async (role) => {
    mocks.requireAuth.mockResolvedValue({ organization, organizationId: 'org-1', userId: 'user-1', role })
    const response = JSON.stringify(await SettingsPage())
    expect(mocks.invites).not.toHaveBeenCalled()
    expect(mocks.members).not.toHaveBeenCalled()
    expect(response).not.toContain('private-invitation-token')
    expect(response).not.toContain('acct_private')
    expect(response).toContain('Your business owner manages')
  })

  it('queries invitations only in the authenticated owner organization', async () => {
    mocks.requireAuth.mockResolvedValue({ organization, organizationId: 'owner-org', userId: 'owner-1', role: 'owner' })
    const response = JSON.stringify(await SettingsPage())
    expect(mocks.invites).toHaveBeenCalledWith(expect.objectContaining({ where: { organizationId: 'owner-org' } }))
    expect(response).toContain('private-invitation-token')
  })
})
