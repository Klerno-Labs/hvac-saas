import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/db', () => ({ db: { organizationMember: { findFirst: vi.fn() } } }))
vi.mock('@/lib/billing', () => ({ isSubscriptionActive: vi.fn() }))
vi.mock('@/app/components/nav-header', () => ({ NavHeader: () => null }))
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { isSubscriptionActive } from '@/lib/billing'
import { getOptionalSession, requireAuth, requireActiveSubscription, requirePageCapability } from '@/lib/session'
import { NavigationWrapper } from '@/app/components/navigation-wrapper'
import { TrialBannerWrapper } from '@/app/components/trial-banner-wrapper'

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(auth).mockResolvedValue({ user: { id: 'signed-in-user', email: 'owner@example.com' } } as never)
  vi.mocked(isSubscriptionActive).mockReturnValue(true)
  vi.mocked(db.organizationMember.findFirst).mockResolvedValue({ role: 'owner', organizationId: 'org_1', organization: {
    id: 'org_1', subscriptionStatus: 'TRIALING', trialEndsAt: new Date(Date.now() + 3 * 86400000),
  } } as never)
})

describe('optional public shell decoration', () => {
  it('keeps the normal authenticated role and trial banner when session data is available', async () => {
    expect((await NavigationWrapper()).props.role).toBe('owner')
    expect((await TrialBannerWrapper())?.props.daysRemaining).toBe(3)
  })
  it('falls back to a neutral header and no trial banner when a signed-in membership lookup fails', async () => {
    vi.mocked(db.organizationMember.findFirst).mockRejectedValue(new Error('database unavailable'))
    expect((await NavigationWrapper()).props.role).toBeNull()
    expect(await TrialBannerWrapper()).toBeNull()
    expect(db.organizationMember.findFirst).toHaveBeenCalledWith({ where: { userId: 'signed-in-user' }, include: { organization: true } })
  })
  it('also tolerates session verification failure for optional decoration only', async () => {
    vi.mocked(auth).mockRejectedValue(new Error('session storage unavailable'))
    expect((await NavigationWrapper()).props.role).toBeNull()
    expect(await TrialBannerWrapper()).toBeNull()
    expect(db.organizationMember.findFirst).not.toHaveBeenCalled()
  })
  it('does not query membership for an anonymous visitor', async () => {
    vi.mocked(auth).mockResolvedValue(null as never)
    expect((await NavigationWrapper()).props.role).toBeNull()
    expect(await TrialBannerWrapper()).toBeNull()
    expect(db.organizationMember.findFirst).not.toHaveBeenCalled()
  })
  it.each([
    'DYNAMIC_SERVER_USAGE',
    'NEXT_REDIRECT;replace;/login;307;',
    'NEXT_HTTP_ERROR_FALLBACK;404',
  ])('preserves Next.js control flow: %s', async digest => {
    const frameworkError = Object.assign(new Error('framework control flow'), { digest })
    vi.mocked(auth).mockRejectedValue(frameworkError)
    await expect(NavigationWrapper()).rejects.toBe(frameworkError)
    await expect(TrialBannerWrapper()).rejects.toBe(frameworkError)
  })
})

describe('private session guards remain fail closed', () => {
  it.each([
    ['requireAuth', () => requireAuth()],
    ['requireActiveSubscription', () => requireActiveSubscription()],
    ['requirePageCapability', () => requirePageCapability('editPricing')],
    ['getOptionalSession outside decoration', () => getOptionalSession()],
  ] as const)('%s still rejects a failed membership lookup', async (_name, run) => {
    const unavailable = new Error('database unavailable')
    vi.mocked(db.organizationMember.findFirst).mockRejectedValue(unavailable)
    await expect(run()).rejects.toBe(unavailable)
  })
  it('does not grant private access when session verification fails', async () => {
    const unavailable = new Error('session verification unavailable')
    vi.mocked(auth).mockRejectedValue(unavailable)
    await expect(requireAuth()).rejects.toBe(unavailable)
    await expect(requireActiveSubscription()).rejects.toBe(unavailable)
    await expect(requirePageCapability('editPricing')).rejects.toBe(unavailable)
  })
})
