import type { ErrorEvent } from '@sentry/nextjs'

function codeLocation(filename?: string) {
  let path = filename?.split(/[?#]/)[0]
  if (!path) return undefined
  if (/^https?:\/\//.test(path)) {
    try { path = new URL(path).pathname } catch { return undefined }
  }
  if (/\/(portal|pay|invite|reset-password)(\/|$)/i.test(path)) return '/[sensitive-route]'
  return path.replace(/[^/\s]+@[^/\s]+/g, '[redacted]')
}

/** Diagnostics retain exception types and code locations, never customer/request payloads. */
export function sanitizeMonitoringEvent(event: ErrorEvent): ErrorEvent {
  return {
    type: event.type,
    event_id: event.event_id, timestamp: event.timestamp, platform: event.platform,
    level: event.level, release: event.release, environment: event.environment,
    exception: event.exception ? { values: event.exception.values?.map(exception => ({
      type: /^[A-Za-z_$][A-Za-z0-9_$]{0,79}$/.test(exception.type || '') ? exception.type : 'Error',
      stacktrace: exception.stacktrace ? { frames: exception.stacktrace.frames?.map(frame => ({
        filename: codeLocation(frame.filename),
        lineno: frame.lineno, colno: frame.colno, in_app: frame.in_app,
      })) } : undefined,
      mechanism: exception.mechanism ? { type: exception.mechanism.type, handled: exception.mechanism.handled } : undefined,
    })) } : undefined,
  }
}
