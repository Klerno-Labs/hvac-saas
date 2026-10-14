'use client'

import { createSessionAcquisition, parseSessionAcquisition } from './acquisition-attribution'

export const ACQUISITION_STORAGE_KEY = 'fc_acquisition_v1'

function optedOut() {
  return navigator.doNotTrack === '1' || (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true
}

export function clearBrowserAcquisition() {
  try { window.sessionStorage.removeItem(ACQUISITION_STORAGE_KEY) } catch { /* Storage may be blocked. */ }
}

/** No request is sent. Keep only a bounded, sanitized first landing in this tab. */
export function captureBrowserAcquisition() {
  if (typeof window === 'undefined') return
  try {
    if (optedOut()) { clearBrowserAcquisition(); return }
    const stored = parseSessionAcquisition(window.sessionStorage.getItem(ACQUISITION_STORAGE_KEY))
    if (stored) return
    clearBrowserAcquisition()
    const context = createSessionAcquisition(window.location.pathname, document.referrer, window.location.origin)
    if (context) window.sessionStorage.setItem(ACQUISITION_STORAGE_KEY, JSON.stringify(context))
  } catch { /* Measurement must not affect navigation or use persistent fallback storage. */ }
}

/** Read again on submission, so expiry and privacy changes override a stale form. */
export function browserSignupAcquisition(): string {
  if (typeof window === 'undefined') return ''
  try {
    const query = new URLSearchParams(window.location.search)
    if (optedOut() || query.has('invite') || query.has('token')) { clearBrowserAcquisition(); return '' }
    const context = parseSessionAcquisition(window.sessionStorage.getItem(ACQUISITION_STORAGE_KEY))
    if (!context) { clearBrowserAcquisition(); return '' }
    return JSON.stringify(context)
  } catch { return '' }
}
