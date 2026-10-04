import { rejectUnauthorizedCron } from '@/lib/cron-auth'
import { NextResponse } from 'next/server'
import { runCollectionsAutomation } from '@/lib/collections'
import { reportScheduledFailure } from '@/lib/scheduled-monitoring'

/**
 * GET or POST /api/collections/run
 *
 * Runs the collections automation engine.
 * Intended to be called by a cron job or manual trigger.
 * Protected by a shared secret to prevent unauthorized invocation.
 */
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const denied = rejectUnauthorizedCron(req)
  if (denied) return denied

  try {
    const result = await runCollectionsAutomation()
    const success = result.errors === 0 && result.needsReview === 0
    if (!success) await reportScheduledFailure('collections', true)
    return NextResponse.json({ success, ...result }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    console.error('Collections automation failed')
    await reportScheduledFailure('collections')
    return NextResponse.json({ error: 'Collections automation failed' }, { status: 500, headers: { 'Cache-Control': 'no-store' } })
  }
}

// Preserve authenticated manual/external-scheduler calls.
export const POST = GET
