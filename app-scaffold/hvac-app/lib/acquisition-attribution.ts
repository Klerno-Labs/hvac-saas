// Exact destinations only: never accept arbitrary slugs, queries or bearer paths.
export const ACQUISITION_PATHS = [
  '/', '/pricing', '/faq', '/demo', '/help', '/resources',
  '/hvac-estimating-software', '/hvac-invoicing-software',
  '/resources/hvac-invoice-template', '/resources/hvac-estimate-template',
  '/resources/hvac-software-checklist', '/tools/hvac-job-pricing-calculator',
  '/tools/paperwork-calculator',
] as const
export const ACQUISITION_SOURCES = ['direct_or_unknown', 'search_google', 'search_bing', 'search_other', 'social', 'referral_other', 'internal'] as const
export const ACQUISITION_TTL_MS = 30 * 60 * 1000
export type AcquisitionMetadata = { version: 1; landingPath: string; source: typeof ACQUISITION_SOURCES[number] }
type SessionAcquisition = AcquisitionMetadata & { capturedAt: number }

function exactKeys(value: unknown, keys: string[]): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every(key => Object.prototype.hasOwnProperty.call(value, key))
}

/** Attribution is advisory browser context, never proof of identity or referral credit. */
export function parseAcquisitionMetadata(value: unknown): AcquisitionMetadata | null {
  if (!exactKeys(value, ['version', 'landingPath', 'source']) || value.version !== 1 || typeof value.landingPath !== 'string' || typeof value.source !== 'string') return null
  if (!(ACQUISITION_PATHS as readonly string[]).includes(value.landingPath) || !(ACQUISITION_SOURCES as readonly string[]).includes(value.source)) return null
  return { version: 1, landingPath: value.landingPath, source: value.source as AcquisitionMetadata['source'] }
}

export function parseSessionAcquisition(raw: unknown, now = Date.now()): SessionAcquisition | null {
  if (typeof raw !== 'string' || raw.length > 512 || !Number.isFinite(now)) return null
  try {
    const value: unknown = JSON.parse(raw)
    if (!exactKeys(value, ['version', 'landingPath', 'source', 'capturedAt']) || typeof value.capturedAt !== 'number' || !Number.isSafeInteger(value.capturedAt) || value.capturedAt <= 0) return null
    const age = now - value.capturedAt
    if (age < 0 || age >= ACQUISITION_TTL_MS) return null
    const metadata = parseAcquisitionMetadata({ version: value.version, landingPath: value.landingPath, source: value.source })
    return metadata ? { ...metadata, capturedAt: value.capturedAt } : null
  } catch { return null }
}

export function parseSignupAcquisition(raw: unknown, now = Date.now()): AcquisitionMetadata | null {
  const context = parseSessionAcquisition(raw, now)
  return context ? { version: context.version, landingPath: context.landingPath, source: context.source } : null
}

const GOOGLE_HOSTS = ['google.com', 'www.google.com', 'google.co.uk', 'www.google.co.uk', 'google.ca', 'www.google.ca', 'google.com.au', 'www.google.com.au', 'google.de', 'www.google.de', 'google.fr', 'www.google.fr']
const BING_HOSTS = ['bing.com', 'www.bing.com', 'cn.bing.com']
const OTHER_SEARCH_HOSTS = ['duckduckgo.com', 'www.duckduckgo.com', 'search.yahoo.com', 'search.brave.com', 'www.ecosia.org', 'ecosia.org']
const SOCIAL_HOSTS = ['facebook.com', 'www.facebook.com', 'm.facebook.com', 'l.facebook.com', 'lm.facebook.com', 'instagram.com', 'www.instagram.com', 'l.instagram.com', 'linkedin.com', 'www.linkedin.com', 'lnkd.in', 'reddit.com', 'www.reddit.com', 'old.reddit.com', 'x.com', 'www.x.com', 't.co', 'twitter.com', 'www.twitter.com', 'youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be', 'pinterest.com', 'www.pinterest.com']

export function classifyAcquisitionSource(referrer: string, currentOrigin: string): AcquisitionMetadata['source'] {
  if (!referrer || referrer.length > 4096) return 'direct_or_unknown'
  try {
    const url = new URL(referrer)
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return 'direct_or_unknown'
    if (url.origin === new URL(currentOrigin).origin) return 'internal'
    if (GOOGLE_HOSTS.includes(url.hostname)) return 'search_google'
    if (BING_HOSTS.includes(url.hostname)) return 'search_bing'
    if (OTHER_SEARCH_HOSTS.includes(url.hostname)) return 'search_other'
    if (SOCIAL_HOSTS.includes(url.hostname)) return 'social'
    return 'referral_other'
  } catch { return 'direct_or_unknown' }
}

export function createSessionAcquisition(pathname: string, referrer: string, origin: string, now = Date.now()): SessionAcquisition | null {
  if (!(ACQUISITION_PATHS as readonly string[]).includes(pathname) || !Number.isSafeInteger(now) || now <= 0) return null
  return { version: 1, landingPath: pathname, source: classifyAcquisitionSource(referrer, origin), capturedAt: Math.floor(now / 60000) * 60000 }
}
