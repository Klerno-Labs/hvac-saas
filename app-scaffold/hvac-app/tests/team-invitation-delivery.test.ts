import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
vi.mock('@/lib/require-admin', () => ({ requireAdmin: vi.fn() }))
vi.mock('@/lib/email', () => ({ sendTeamInviteEmail: vi.fn() }))
vi.mock('@/lib/events', () => ({ trackEvent: vi.fn() }))
vi.mock('@/lib/audit', () => ({ logAudit: vi.fn() }))
vi.mock('@/lib/billing', () => ({ isSubscriptionActive: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/lib/db', () => ({ db: {
  $transaction: vi.fn(), $queryRaw: vi.fn(),
  organization: { findUnique: vi.fn() },
  user: { findFirst: vi.fn() },
  organizationMember: { findFirst: vi.fn(), count: vi.fn() },
  teamInvite: { findFirst: vi.fn(), count: vi.fn(), create: vi.fn(), update: vi.fn() },
} }))
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/require-admin'
import { sendTeamInviteEmail } from '@/lib/email'
import { isSubscriptionActive } from '@/lib/billing'
import { inviteTeamMember, resendTeamInvitation } from '@/app/settings/team/actions'
import { TeamSection } from '@/app/settings/team-section'

const invitation = { id: 'invite_1', organizationId: 'org_1', email: 'tech@example.com', role: 'technician',
  token: 'a'.repeat(64), acceptedAt: null, expiresAt: new Date(Date.now() + 86400000) }
const org = { id: 'org_1', name: 'Test service team', plan: 'PRO', readOnlyAt: null }
function form(email = 'Tech@Example.com') {
  const data = new FormData()
  data.set('email', email)
  data.set('role', 'technician')
  return data
}
beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('APP_URL', 'https://fieldclose.example')
  vi.mocked(requireAdmin).mockResolvedValue({ authorized: true, context: { userId: 'owner_1', userEmail: 'owner@example.com', organizationId: 'org_1', role: 'owner' } })
  vi.mocked(isSubscriptionActive).mockReturnValue(true)
  vi.mocked(db.$transaction).mockImplementation(async (fn: any) => fn(db))
  vi.mocked(db.organization.findUnique).mockResolvedValue(org as never)
  vi.mocked(db.organizationMember.count).mockResolvedValue(1)
  vi.mocked(db.teamInvite.count).mockResolvedValue(0)
  vi.mocked(db.teamInvite.create).mockResolvedValue(invitation as never)
  vi.mocked(sendTeamInviteEmail).mockResolvedValue({ success: true } as never)
})
afterEach(() => vi.unstubAllEnvs())

describe('team invitation delivery', () => {
  it('reports provider failure while preserving a saved invitation for explicit retry', async () => {
    vi.mocked(sendTeamInviteEmail).mockResolvedValue({ success: false, error: 'Email unavailable', retryable: true })
    expect(await inviteTeamMember(form())).toEqual({ success: true, delivery: 'failed' })
    expect(db.teamInvite.create).toHaveBeenCalledOnce()
    expect(db.teamInvite.update).not.toHaveBeenCalled()
  })
  it('reports a thrown delivery error without logging the token or fabricating email success', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(sendTeamInviteEmail).mockRejectedValue(new Error(`provider failed for ${invitation.token}`))
    expect(await inviteTeamMember(form())).toEqual({ success: true, delivery: 'unconfirmed' })
    expect(JSON.stringify(log.mock.calls)).not.toContain(invitation.token)
    log.mockRestore()
  })
  it('only reports sent after the provider accepts the email', async () => {
    expect(await inviteTeamMember(form())).toEqual({ success: true, delivery: 'sent' })
    expect(sendTeamInviteEmail).toHaveBeenCalledWith({ to: 'tech@example.com', orgName: org.name,
      inviterName: 'owner@example.com', signupUrl: `https://fieldclose.example/invite/${invitation.token}` })
    expect(db.teamInvite.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ email: 'tech@example.com', role: 'technician', organizationId: 'org_1' }) }))
  })
  it('does not create another invitation when a pending one already exists', async () => {
    vi.mocked(db.teamInvite.findFirst).mockResolvedValue(invitation as never)
    expect(await inviteTeamMember(form())).toMatchObject({ success: false, error: expect.stringContaining('Resend invitation') })
    expect(db.teamInvite.create).not.toHaveBeenCalled()
    expect(sendTeamInviteEmail).not.toHaveBeenCalled()
    expect(db.$queryRaw).toHaveBeenCalled()
    expect(vi.mocked(db.$queryRaw).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(db.teamInvite.findFirst).mock.invocationCallOrder[0])
    expect(db.teamInvite.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ email: { equals: 'tech@example.com', mode: 'insensitive' }, organizationId: 'org_1', acceptedAt: null }) }))
  })
  it('keeps owner authorization and Starter seat limits on creation and retry', async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ authorized: false, error: 'Only organization owners can perform this action' })
    expect((await inviteTeamMember(form())).success).toBe(false)
    expect((await resendTeamInvitation('invite_1')).success).toBe(false)
    expect(db.$transaction).not.toHaveBeenCalled()
    expect(sendTeamInviteEmail).not.toHaveBeenCalled()
  })
  it('does not send when Starter seats are exhausted', async () => {
    vi.mocked(db.organization.findUnique).mockResolvedValue({ ...org, plan: 'STARTER' } as never)
    expect((await inviteTeamMember(form())).success).toBe(false)
    vi.mocked(db.teamInvite.findFirst).mockResolvedValue(invitation as never)
    expect((await resendTeamInvitation('invite_1')).success).toBe(false)
    expect(sendTeamInviteEmail).not.toHaveBeenCalled()
  })
  it('does not send new or retried invitations for an inactive workspace', async () => {
    vi.mocked(isSubscriptionActive).mockReturnValue(false)
    expect((await inviteTeamMember(form())).success).toBe(false)
    expect((await resendTeamInvitation('invite_1')).success).toBe(false)
    expect(db.teamInvite.create).not.toHaveBeenCalled()
    expect(sendTeamInviteEmail).not.toHaveBeenCalled()
  })
  it('does not send an email if invitation creation fails', async () => {
    vi.mocked(db.teamInvite.create).mockRejectedValue(new Error('database failure'))
    expect((await inviteTeamMember(form())).success).toBe(false)
    expect(sendTeamInviteEmail).not.toHaveBeenCalled()
  })
})

describe('retrying an existing pending invitation', () => {
  it('reuses the stored recipient, role, token, and expiry without creating or changing a row', async () => {
    vi.mocked(db.teamInvite.findFirst).mockResolvedValue(invitation as never)
    expect(await resendTeamInvitation('invite_1')).toEqual({ success: true, delivery: 'sent' })
    expect(db.teamInvite.findFirst).toHaveBeenCalledWith({ where: { id: 'invite_1', organizationId: 'org_1' } })
    expect(sendTeamInviteEmail).toHaveBeenCalledWith(expect.objectContaining({ to: invitation.email, signupUrl: `https://fieldclose.example/invite/${invitation.token}` }))
    expect(db.teamInvite.create).not.toHaveBeenCalled()
    expect(db.teamInvite.update).not.toHaveBeenCalled()
  })
  it.each([
    { name: 'accepted', value: { ...invitation, acceptedAt: new Date() } },
    { name: 'expired or revoked', value: { ...invitation, expiresAt: new Date(Date.now() - 1000) } },
    { name: 'missing or in another organization', value: null },
  ])('rejects an invitation that is $name', async ({ value }) => {
    vi.mocked(db.teamInvite.findFirst).mockResolvedValue(value as never)
    expect((await resendTeamInvitation('invite_1')).success).toBe(false)
    expect(sendTeamInviteEmail).not.toHaveBeenCalled()
    expect(db.teamInvite.update).not.toHaveBeenCalled()
  })
  it('reports a retry delivery failure truthfully', async () => {
    vi.mocked(db.teamInvite.findFirst).mockResolvedValue(invitation as never)
    vi.mocked(sendTeamInviteEmail).mockResolvedValue({ success: false, error: 'Email unavailable', retryable: true })
    expect(await resendTeamInvitation('invite_1')).toEqual({ success: true, delivery: 'failed' })
  })
  it.each([false, undefined])('preserves an uncertain provider outcome on creation and retry (retryable=%s)', async (retryable) => {
    vi.mocked(sendTeamInviteEmail).mockResolvedValue({ success: false, error: 'Acceptance unknown', retryable })
    expect(await inviteTeamMember(form())).toEqual({ success: true, delivery: 'unconfirmed' })
    vi.mocked(db.teamInvite.findFirst).mockResolvedValue(invitation as never)
    expect(await resendTeamInvitation('invite_1')).toEqual({ success: true, delivery: 'unconfirmed' })
    expect(db.teamInvite.create).toHaveBeenCalledTimes(1)
    expect(db.teamInvite.update).not.toHaveBeenCalled()
    expect(sendTeamInviteEmail).toHaveBeenCalledTimes(2)
  })
  it('shows an accessible resend control only for active pending invitations', () => {
    const html = renderToStaticMarkup(React.createElement(TeamSection, { currentUserId: 'owner_1', members: [], invites: [
      invitation, { ...invitation, id: 'accepted', email: 'accepted@example.com', acceptedAt: new Date() },
      { ...invitation, id: 'expired', email: 'expired@example.com', expiresAt: new Date(Date.now() - 1000) },
    ] }))
    expect(html).toContain('aria-label="Resend invitation to tech@example.com"')
    expect(html).not.toContain('Resend invitation to accepted@example.com')
    expect(html).not.toContain('Resend invitation to expired@example.com')
    expect(html).not.toContain(invitation.token)
  })
})
