import { rejectUnauthorizedCron } from '@/lib/cron-auth'
import { NextResponse } from 'next/server'
import { runCollectionsAutomation } from '@/lib/collections'

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
    return NextResponse.json({ success: true, ...result }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('Collections automation error:', error)
    return NextResponse.json({ error: 'Collections automation failed' }, { status: 500, headers: { 'Cache-Control': 'no-store' } })
  }
}

// Preserve authenticated manual/external-scheduler calls.
export const POST = GET
