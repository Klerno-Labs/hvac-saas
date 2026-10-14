import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const { track } = vi.hoisted(() => ({ track: vi.fn() }))
vi.mock('@vercel/analytics', () => ({ track }))
import { trackPublicFunnel } from '@/lib/track-public-funnel'
import { FUNNEL_EVENTS, type FunnelEvent } from '@/lib/public-funnel'

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('NEXT_PUBLIC_ENABLE_FUNNEL_EVENTS', 'true')
  vi.stubGlobal('window', { location: { pathname: '/demo', search: '?email=private@example.test', hash: '#private-token' } })
  vi.stubGlobal('navigator', { doNotTrack: '0', globalPrivacyControl: false })
})
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

describe('public funnel event privacy and availability', () => {
  it.each([undefined, '', 'false', 'TRUE', '1', ' true '])('requires exactly the explicit public enable flag: %s', value => {
    vi.stubEnv('NEXT_PUBLIC_ENABLE_FUNNEL_EVENTS', value)
    trackPublicFunnel('demo_started')
    expect(track).not.toHaveBeenCalled()
  })
  it.each([...FUNNEL_EVENTS])('sends only the fixed event and public pathname: %s', event => {
    trackPublicFunnel(event)
    expect(track).toHaveBeenCalledExactlyOnceWith(event, { page: '/demo' })
    expect(JSON.stringify(track.mock.calls)).not.toContain('private')
  })
  it.each(['/dashboard', '/signup', '/login', '/portal/private-token', '/jobs/customer-id', '/api/pay', '/help/UPPERCASE', '/help/../../portal/token'])('does not track private or invalid paths: %s', pathname => {
    vi.stubGlobal('window', { location: { pathname } })
    trackPublicFunnel('demo_started')
    expect(track).not.toHaveBeenCalled()
  })
  it('allows a public help article while excluding its query and fragment', () => {
    vi.stubGlobal('window', { location: { pathname: '/help/getting-started', search: '?token=secret', hash: '#email-secret' } })
    trackPublicFunnel('signup_clicked')
    expect(track).toHaveBeenCalledExactlyOnceWith('signup_clicked', { page: '/help/getting-started' })
  })
  it.each(['customer_email', '', 'constructor', 'demo_started?email=private'])('rejects unapproved event names at runtime: %s', name => {
    trackPublicFunnel(name as FunnelEvent)
    expect(track).not.toHaveBeenCalled()
  })
  it.each([{ doNotTrack: '1' }, { globalPrivacyControl: true }, { doNotTrack: '1', globalPrivacyControl: true }])('honors privacy preferences: %j', preferences => {
    vi.stubGlobal('navigator', preferences)
    trackPublicFunnel('demo_started')
    expect(track).not.toHaveBeenCalled()
  })
  it('does nothing during server rendering', () => {
    vi.stubGlobal('window', undefined)
    expect(() => trackPublicFunnel('demo_started')).not.toThrow()
    expect(track).not.toHaveBeenCalled()
  })
  it('does not let provider failure interrupt a user action', () => {
    track.mockImplementation(() => { throw new Error('Analytics plan unavailable') })
    expect(() => trackPublicFunnel('demo_started')).not.toThrow()
  })
})
