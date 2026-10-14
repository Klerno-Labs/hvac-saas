import * as Sentry from '@sentry/nextjs'
import { sanitizeMonitoringEvent } from './lib/monitoring'

if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    sendDefaultPii: false,
    tracesSampleRate: 0,
    beforeBreadcrumb: () => null,
    beforeSend: sanitizeMonitoringEvent,
  })
}
