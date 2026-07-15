import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { sendJobCompleteNotice, isAuthorized } from '@/lib/job-complete-notice'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const authHeader = req.headers.get('authorization')
  const expectedSecret = process.env.COLLECTIONS_CRON_SECRET

  if (expectedSecret && !isAuthorized(authHeader, expectedSecret)) {
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

    let sent = 0
    let skipped = 0

    for (const job of jobs) {
      const wasSent = await sendJobCompleteNotice(job.id, job.organizationId)
      if (wasSent) {
        sent++
      } else {
        skipped++
      }
    }

    return NextResponse.json({ success: true, processed: jobs.length, sent, skipped })
  } catch (error) {
    console.error('Job complete notices error:', error)
    return NextResponse.json({ error: 'Job complete notices failed' }, { status: 500 })
  }
}
