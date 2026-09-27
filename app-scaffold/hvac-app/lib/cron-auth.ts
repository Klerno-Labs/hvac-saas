import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'

/**
 * Vercel sends CRON_SECRET automatically. Keep the existing external-scheduler
 * token valid during migration; every request must match one configured token.
 */
export function rejectUnauthorizedCron(request: Request): NextResponse | null {
  const secrets = [...new Set([process.env.CRON_SECRET, process.env.COLLECTIONS_CRON_SECRET].filter(
    (value): value is string => Boolean(value),
  ))]
  if (!secrets.length) {
    return NextResponse.json({ error: 'Scheduled tasks are not configured' }, {
      status: 503, headers: { 'Cache-Control': 'no-store' },
    })
  }
  const supplied = Buffer.from(request.headers.get('authorization') ?? '')
  const authorized = secrets.some(secret => {
    const expected = Buffer.from(`Bearer ${secret}`)
    return supplied.length === expected.length && timingSafeEqual(supplied, expected)
  })
  if (!authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, {
      status: 401, headers: { 'Cache-Control': 'no-store' },
    })
  }
  // External delivery must be explicitly enabled. Missing or misspelled
  // configuration must never turn a paused scheduler into an active one.
  if (process.env.SCHEDULED_TASKS_ENABLED !== 'true') {
    return NextResponse.json({ error: 'Scheduled tasks are paused' }, {
      status: 503, headers: { 'Cache-Control': 'no-store' },
    })
  }
  return null
}
