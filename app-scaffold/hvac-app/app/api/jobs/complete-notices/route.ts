import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { sendJobCompleteNotice } from '@/lib/job-complete-notice'

export const runtime = 'nodejs'

/**
 * POST /api/jobs/complete-notices
 *
 * Backfills/retries completion notices for jobs that completed before this
 * feature shipped, or where no customer contact method existed at the time.
 * Protected by COLLECTIONS_CRON_SECRET (same pattern as /api/recurring/generate).
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
    const jobs = await db.job.findMany({
      where: {
        status: 'completed',
        completionNoticeSentAt: null,
        organization: { jobCompletionNoticeEnabled: true },
      },
      select: { id: true, organizationId: true },
      take: 200,
    })

    let processed = 0
    let sent = 0
    let skipped = 0

    for (const job of jobs) {
      processed++
      const result = await sendJobCompleteNotice(job.id, job.organizationId)
      if (result.sent) {
        sent++
      } else {
        skipped++
      }
    }

    return NextResponse.json({ success: true, processed, sent, skipped })
  } catch (error) {
    console.error('Job complete notice backfill error:', error)
    return NextResponse.json({ error: 'Job complete notice backfill failed' }, { status: 500 })
  }
}
