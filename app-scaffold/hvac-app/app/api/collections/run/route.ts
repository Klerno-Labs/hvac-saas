import { NextResponse } from 'next/server'
import { runCollectionsAutomation } from '@/lib/collections'

/**
 * POST /api/collections/run
 *
 * Runs the collections automation engine.
 * Intended to be called by a cron job or manual trigger.
 * Protected by a shared secret to prevent unauthorized invocation.
 */
export const GET = POST

export async function POST(req: Request) {
  const authHeader = req.headers.get('authorization')
  const expectedSecret = process.env.COLLECTIONS_CRON_SECRET

  // If a secret is configured, require it. Otherwise allow in development.
  if (expectedSecret && authHeader !== `Bearer ${expectedSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!expectedSecret && process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'COLLECTIONS_CRON_SECRET not configured' }, { status: 500 })
  }

  try {
    const result = await runCollectionsAutomation()
    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    console.error('Collections automation error:', error)
    return NextResponse.json({ error: 'Collections automation failed' }, { status: 500 })
  }
}
