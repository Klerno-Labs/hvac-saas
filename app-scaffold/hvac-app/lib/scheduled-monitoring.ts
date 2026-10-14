import * as Sentry from '@sentry/nextjs'

const taskNames = {
  appointments: 'AppointmentReminder',
  collections: 'CollectionAutomation',
  recurring: 'RecurringGeneration',
} as const

/** Fixed diagnostics only: never forward provider errors, recipients or payloads. */
export async function reportScheduledFailure(task: keyof typeof taskNames, partial = false): Promise<void> {
  if (!process.env.SENTRY_DSN?.trim()) return
  try {
    const error = new Error('Scheduled work needs operator review')
    error.name = `${taskNames[task]}${partial ? 'PartialFailure' : 'Failure'}`
    Sentry.captureException(error)
    // The route may finish immediately afterward in a serverless runtime.
    // Bound the wait; reporting must never hold up or replay provider work.
    await Sentry.flush(2000)
  } catch {
    // Monitoring failure must not replay an already accepted external delivery.
    console.error('Scheduled failure reporting unavailable')
  }
}
