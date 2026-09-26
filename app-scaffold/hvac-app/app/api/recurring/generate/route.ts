import { rejectUnauthorizedCron } from '@/lib/cron-auth'
import { NextResponse } from 'next/server'
import { generateDueRecurringJobs } from '@/lib/recurring-generation'

export const runtime = 'nodejs'

/**
 * GET or POST /api/recurring/generate
 *
 * Finds all active recurring jobs where nextDueDate <= now,
 * creates a new Job for each, and advances the nextDueDate.
 * Protected by CRON_SECRET or the legacy COLLECTIONS_CRON_SECRET.
 */
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const denied = rejectUnauthorizedCron(req)
  if (denied) return denied

  try {
    const result = await generateDueRecurringJobs()
    return NextResponse.json({ success: true, ...result }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('Recurring job generation error:', error)
    return NextResponse.json({ error: 'Recurring job generation failed' }, { status: 500, headers: { 'Cache-Control': 'no-store' } })
  }
}

// Preserve authenticated manual/external-scheduler calls.
export const POST = GET
