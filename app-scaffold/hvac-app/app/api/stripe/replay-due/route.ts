import { NextResponse } from 'next/server'
import { processDueRetries } from '@/lib/stripe-webhook-replay'

export const runtime = 'nodejs'

/**
 * POST /api/stripe/replay-due
 *
 * Drives the bounded-backoff retry queue for Stripe webhook events. Picks up
 * every `retry_scheduled` event whose `nextRetryAt` has elapsed, re-fetches it
 * from the Stripe API, and re-dispatches.
 *
 * Intended to be called by a cron job (e.g. Vercel Cron) roughly every 5–10
 * minutes. Protected by `COLLECTIONS_CRON_SECRET` using the same bearer-token
 * pattern as `/api/collections/run` and `/api/recurring/generate`.
 *
 * Recommended cron schedule (cron-tab.org / Vercel Cron): `*/5 * * * *`
 *   curl -X POST -H "Authorization: Bearer $COLLECTIONS_CRON_SECRET" \
 *     $APP_URL/api/stripe/replay-due
 */
export async function POST(req: Request) {
  const authHeader = req.headers.get('authorization')
  const expectedSecret = process.env.COLLECTIONS_CRON_SECRET

  if (expectedSecret && authHeader !== `Bearer ${expectedSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!expectedSecret && process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'COLLECTIONS_CRON_SECRET not configured' }, { status: 500 })
  }

  try {
    const result = await processDueRetries()
    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    console.error('Stripe webhook replay scheduler error:', error)
    return NextResponse.json({ error: 'Replay scheduler failed' }, { status: 500 })
  }
}
