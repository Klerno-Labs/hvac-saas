import * as Sentry from '@sentry/nextjs'
import { sanitizeMonitoringEvent } from './lib/monitoring'

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    sendDefaultPii: false,
    tracesSampleRate: 0,
    beforeBreadcrumb: () => null,
    beforeSend: sanitizeMonitoringEvent,
  })
}
