import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { sanitizeMonitoringEvent } from '@/lib/monitoring'
const sdk = vi.hoisted(() => ({ init: vi.fn(), captureRequestError: vi.fn() }))
vi.mock('@sentry/nextjs', () => sdk)
beforeEach(() => { vi.resetModules(); vi.clearAllMocks() })
afterEach(() => vi.unstubAllEnvs())
describe('error monitoring activation and privacy', () => {
  it('removes request content, raw error values, users, logs and breadcrumbs', () => {
    const event = sanitizeMonitoringEvent({ type: undefined, event_id: 'event', request: { url: 'https://host/portal/private-token', headers: { authorization: 'private-secret' }, data: 'private-payload' }, message: 'private-message', user: { email: 'private-email' }, extra: { token: 'private-secret' }, breadcrumbs: [{ message: 'private-message' }], exception: { values: [{ type: 'TypeError', value: 'private-message', stacktrace: { frames: [{ filename: '/app/page.ts?token=private-secret', function: 'handler', lineno: 12, vars: { password: 'private-secret' } }] } }] } })
    expect(JSON.stringify(event)).not.toContain('private-')
    expect(event.exception?.values?.[0]).toMatchObject({ type: 'TypeError', stacktrace: { frames: [{ filename: '/app/page.ts', lineno: 12 }] } })
  })
  it.each(['https://private-user:private-secret@example.test/portal/private-token/invoices/id?secret=private-query', '/pay/private-token', '/invite/private-token', '/reset-password/private-token'])('does not retain sensitive route identities in stack locations', filename => {
    expect(JSON.stringify(sanitizeMonitoringEvent({ type: undefined, exception: { values: [{ type: 'private-user@example.test', stacktrace: { frames: [{ filename, function: 'private-user@example.test', module: 'private-token' }] } }] } }))).not.toContain('private-')
  })
  it('does not initialize server monitoring with no destination', async () => {
    vi.stubEnv('SENTRY_DSN', '')
    vi.stubEnv('NEXT_RUNTIME', 'nodejs')
    const instrumentation = await import('@/instrumentation')
    await instrumentation.register()
    expect(sdk.init).not.toHaveBeenCalled()
    expect(instrumentation.onRequestError).toBe(sdk.captureRequestError)
  })
  it.each(['nodejs', 'edge'])('initializes the %s hook with privacy filtering and no tracing', async runtime => {
    vi.stubEnv('SENTRY_DSN', 'https://fixture@sentry.example.test/123')
    vi.stubEnv('NEXT_RUNTIME', runtime)
    await (await import('@/instrumentation')).register()
    expect(sdk.init).toHaveBeenCalledWith(expect.objectContaining({ sendDefaultPii: false, tracesSampleRate: 0, beforeSend: expect.any(Function) }))
  })
  it('loads browser monitoring through the Next.js client entry without replay', async () => {
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', 'https://fixture@sentry.example.test/123')
    await import('@/instrumentation-client')
    expect(sdk.init).toHaveBeenCalledWith(expect.objectContaining({ sendDefaultPii: false, tracesSampleRate: 0, beforeSend: expect.any(Function) }))
    expect(sdk.init.mock.calls[0][0]).not.toHaveProperty('replaysSessionSampleRate')
  })
})
