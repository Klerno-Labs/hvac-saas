import { NextResponse } from 'next/server'
import { pruneRateLimitHits } from '@/lib/rate-limit/store'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// 24 hours — prune anything outside the largest rate-limit window
const PRUNE_WINDOW_MS = 24 * 60 * 60 * 1000

export async function POST(req: Request): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET
  const provided = req.headers.get('x-cron-secret')

  // Reject before doing any work; never log the secret or the provided value.
  if (!secret || provided !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { deleted } = await pruneRateLimitHits(PRUNE_WINDOW_MS)
    return NextResponse.json({ deleted })
  } catch (err) {
    console.error('[rate-limit-prune] prune failed', String(err))
    return NextResponse.json({ error: 'prune_failed' }, { status: 500 })
  }
}
