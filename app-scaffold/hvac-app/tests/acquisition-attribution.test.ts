import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ACQUISITION_PATHS, ACQUISITION_TTL_MS, classifyAcquisitionSource, createSessionAcquisition, parseAcquisitionMetadata, parseSessionAcquisition, parseSignupAcquisition } from '@/lib/acquisition-attribution'
import { ACQUISITION_STORAGE_KEY, browserSignupAcquisition, captureBrowserAcquisition, clearBrowserAcquisition } from '@/lib/acquisition-attribution-browser'
import { PUBLIC_PAGES } from '@/lib/public-funnel'

const now = Date.UTC(2026, 9, 4, 12)
const context = { version: 1, landingPath: '/resources/hvac-invoice-template', source: 'search_google', capturedAt: now }
const raw = (changes = {}) => JSON.stringify({ ...context, ...changes })

describe('bounded acquisition metadata', () => {
  it('keeps only explicit published public paths and coarse source values', () => {
    for (const path of ACQUISITION_PATHS) expect(PUBLIC_PAGES).toContain(path)
    expect(parseSignupAcquisition(raw(), now + 10)).toEqual({ version: 1, landingPath: context.landingPath, source: 'search_google' })
    expect(parseAcquisitionMetadata({ version: 1, landingPath: '/', source: 'internal' })).toEqual({ version: 1, landingPath: '/', source: 'internal' })
  })

  it.each(['/signup', '/login', '/invite/bearer-secret', '/portal/secret', '/api/auth/callback/github', '/help/secret-token', '/resources/customer-name', '/?email=private', '/resources#token', 'https://fieldclose.app/', '//google.com', '/resources/../portal/token'])('rejects private, unknown or non-path landing %s', landingPath => {
    expect(createSessionAcquisition(landingPath, '', 'https://fieldclose.app', now)).toBeNull()
    expect(parseSignupAcquisition(raw({ landingPath }), now)).toBeNull()
  })

  it('drops unknown fields, raw query/referrer text, invalid versions and malformed payloads', () => {
    for (const changes of [{ source: 'owner@example.test' }, { version: 2 }, { referrer: 'https://google.com?q=private' }, { email: 'private@example.test' }, { landingPath: null }, { capturedAt: 'today' }, { capturedAt: now + 1 }]) expect(parseSignupAcquisition(raw(changes), now)).toBeNull()
    for (const value of [null, new Blob(['secret']), '', '{', '[]', '{}', 'null', raw({ source: 'x'.repeat(600) })]) expect(parseSignupAcquisition(value, now)).toBeNull()
    expect(parseAcquisitionMetadata({ version: 1, landingPath: '/', source: 'social', capturedAt: now })).toBeNull()
    expect(parseAcquisitionMetadata(Object.assign(Object.create({ version: 1 }), { landingPath: '/', source: 'social' }))).toBeNull()
  })

  it('accepts a fresh context but rejects expiry, future timestamps and noninteger dates', () => {
    expect(parseSessionAcquisition(raw(), now + ACQUISITION_TTL_MS - 1)).not.toBeNull()
    for (const time of [now - 1, now + ACQUISITION_TTL_MS, now + ACQUISITION_TTL_MS + 1, NaN]) expect(parseSessionAcquisition(raw(), time)).toBeNull()
    for (const capturedAt of [0, -1, now + 0.1]) expect(parseSessionAcquisition(raw({ capturedAt }), now)).toBeNull()
  })

  it.each([
    ['https://www.google.com/search?q=private@example.test#secret', 'search_google'],
    ['https://www.bing.com/search?q=private', 'search_bing'],
    ['https://duckduckgo.com/?q=private', 'search_other'],
    ['https://l.facebook.com/l.php?u=private', 'social'],
    ['https://fieldclose.app/portal/private-token', 'internal'],
    ['https://google.com.attacker.test/private', 'referral_other'],
    ['https://private-name.attacker.test/', 'referral_other'],
    ['https://google.com@attacker.test/', 'direct_or_unknown'],
    ['', 'direct_or_unknown'], ['javascript:secret', 'direct_or_unknown'], ['not-a-url', 'direct_or_unknown'],
  ])('classifies %s without retaining referrer text', (referrer, expected) => {
    expect(classifyAcquisitionSource(referrer, 'https://fieldclose.app')).toBe(expected)
    const saved = createSessionAcquisition('/resources', referrer, 'https://fieldclose.app', now)!
    expect(saved.source).toBe(expected)
    expect(JSON.stringify(saved)).not.toMatch(/private|secret|attacker|@|\?|#/)
  })
})

describe('session-only browser attribution', () => {
  let storage: Map<string, string>
  beforeEach(() => {
    vi.useFakeTimers(); vi.setSystemTime(now)
    storage = new Map()
    vi.stubGlobal('window', { location: { pathname: '/resources', origin: 'https://fieldclose.app', search: '?utm_source=private@example.test#secret' }, sessionStorage: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) } })
    vi.stubGlobal('document', { referrer: 'https://www.google.com/search?q=private@example.test' })
    vi.stubGlobal('navigator', { doNotTrack: '0', globalPrivacyControl: false })
  })
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

  it('stores the first public landing without query data and preserves it across navigation', () => {
    captureBrowserAcquisition()
    const first = storage.get(ACQUISITION_STORAGE_KEY)!
    expect(JSON.parse(first)).toEqual({ version: 1, landingPath: '/resources', source: 'search_google', capturedAt: now })
    window.location.pathname = '/pricing'
    captureBrowserAcquisition()
    expect(storage.get(ACQUISITION_STORAGE_KEY)).toBe(first)
    window.location.pathname = '/signup'
    expect(browserSignupAcquisition()).toBe(first)
    clearBrowserAcquisition()
    expect(storage.size).toBe(0)
  })

  it.each([{ doNotTrack: '1' }, { globalPrivacyControl: true }])('clears captured data when privacy preferences change: %j', preference => {
    captureBrowserAcquisition()
    vi.stubGlobal('navigator', preference)
    expect(browserSignupAcquisition()).toBe('')
    captureBrowserAcquisition()
    expect(storage.size).toBe(0)
  })

  it('expires stale context and never captures private routes or arbitrary help slugs', () => {
    captureBrowserAcquisition()
    vi.setSystemTime(now + ACQUISITION_TTL_MS)
    expect(browserSignupAcquisition()).toBe('')
    for (const path of ['/signup', '/portal/secret', '/help/customer-name']) {
      window.location.pathname = path
      captureBrowserAcquisition()
      expect(storage.size).toBe(0)
    }
  })

  it.each(['?invite=private', '?token=private'])('removes attribution at token-bearing signup %s', search => {
    captureBrowserAcquisition()
    window.location.search = search
    expect(browserSignupAcquisition()).toBe('')
    expect(storage.size).toBe(0)
  })

  it('does not throw or use alternate storage when browser storage is unavailable', () => {
    Object.defineProperty(window, 'sessionStorage', { get() { throw new Error('Storage blocked') } })
    expect(() => captureBrowserAcquisition()).not.toThrow()
    expect(browserSignupAcquisition()).toBe('')
    expect(() => clearBrowserAcquisition()).not.toThrow()
    expect(storage.size).toBe(0)
  })
})
