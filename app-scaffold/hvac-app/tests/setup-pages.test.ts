import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const mocks = vi.hoisted(() => ({ auth: vi.fn(), member: vi.fn(), readiness: vi.fn() }))
vi.mock('@/lib/auth', () => ({ auth: mocks.auth }))
vi.mock('@/lib/db', () => ({ db: { organizationMember: { findFirst: mocks.member } } }))
vi.mock('@/lib/activation-readiness', () => ({ getActivationReadiness: mocks.readiness }))
vi.mock('@/app/setup/business/actions', () => ({ saveBusinessProfile: vi.fn() }))
vi.mock('@/app/dashboard/dismiss-onboarding-action', () => ({ dismissOnboarding: vi.fn() }))
vi.mock('next/link', () => ({ default: ({ children, ...props }: Record<string, unknown>) => createElement('a', props, children as never) }))
vi.mock('next/navigation', () => ({
  redirect: vi.fn((path: string) => { throw new Error(`redirect:${path}`) }),
  useRouter: () => ({ refresh: vi.fn() }),
}))
import SetupPage from '@/app/setup/page'
import BusinessProfilePage from '@/app/setup/business/page'
import { GettingStartedChecklist } from '@/app/components/getting-started-checklist'

const organization = { id: 'server-org', name: 'Owner Business', tradeType: 'plumbing', timezone: 'America/Chicago', phone: null, email: null, subscriptionStatus: 'CANCELED', trialEndsAt: null, readOnlyAt: null, onboardingStatus: 'completed' }
const progress = { completed: 1, total: 7, writable: false, subscriptionActive: false, subscriptionLabel: 'App subscription needs attention', nextAction: { label: 'Review app subscription', href: '/settings/billing' },
  steps: [{ id: 'business', title: 'Set up your business', description: 'Saved business details', complete: true, status: 'Saved', action: { label: 'Review app subscription', href: '/settings/billing' } }] }

beforeEach(() => {
  vi.resetAllMocks()
  mocks.auth.mockResolvedValue({ user: { id: 'owner-one' } })
  mocks.member.mockResolvedValue({ organizationId: organization.id, role: 'owner', organization })
  mocks.readiness.mockResolvedValue(progress)
})

describe('persistent owner setup routes', () => {
  it.each([SetupPage, BusinessProfilePage])('requires sign-in before reading setup data', async page => {
    mocks.auth.mockResolvedValue(null)
    await expect(page()).rejects.toThrow('redirect:/login')
    expect(mocks.readiness).not.toHaveBeenCalled()
  })
  it.each(['technician', 'office_admin', 'dispatcher', 'member'])('prevents %s from opening either owner setup page', async role => {
    mocks.member.mockResolvedValue({ organizationId: organization.id, role, organization })
    await expect(SetupPage()).rejects.toThrow('redirect:/field')
    await expect(BusinessProfilePage()).rejects.toThrow('redirect:/field')
    expect(mocks.readiness).not.toHaveBeenCalled()
  })
  it('keeps setup available after dashboard dismissal and subscription expiry', async () => {
    const html = renderToStaticMarkup(await SetupPage())
    expect(html).toContain('App subscription needs attention')
    expect(html).toContain('href="/settings/billing"')
    expect(html).toContain('1 of 7 steps complete')
    expect(mocks.readiness).toHaveBeenCalledWith(expect.objectContaining({ organizationId: 'server-org', role: 'owner' }))
  })
  it('shows the business form read-only with billing recovery for an inactive workspace', async () => {
    const html = renderToStaticMarkup(await BusinessProfilePage())
    expect(html).toContain('Your workspace is read-only')
    expect(html).toContain('<fieldset disabled=""')
    expect(html).toContain('href="/settings/billing"')
  })
  it('lets active owners edit their own business profile', async () => {
    mocks.member.mockResolvedValue({ organizationId: organization.id, role: 'owner', organization: { ...organization, subscriptionStatus: 'ACTIVE' } })
    const html = renderToStaticMarkup(await BusinessProfilePage())
    expect(html).not.toContain('<fieldset disabled=""')
    expect(html).toContain('Owner Business')
    expect(html).toContain('Save business details')
  })
  it('dashboard dismissal is clearly a display preference, with a persistent setup link', () => {
    const html = renderToStaticMarkup(createElement(GettingStartedChecklist, { readiness: progress as never }))
    expect(html).toContain('Hide from dashboard')
    expect(html).toContain('href="/setup"')
    expect(html).toContain('return to Setup after hiding')
    expect(html).not.toContain('Mark complete')
  })
})
