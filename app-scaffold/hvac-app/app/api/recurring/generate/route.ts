import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const runtime = 'nodejs'

/**
 * POST /api/recurring/generate
 *
 * Finds all active recurring jobs where nextDueDate <= now,
 * creates a new Job for each, and advances the nextDueDate.
 * Protected by COLLECTIONS_CRON_SECRET (same pattern as /api/collections/run).
 */
export const GET = POST

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
    const now = new Date()

    const dueJobs = await db.recurringJob.findMany({
      where: {
        isActive: true,
        nextDueDate: { lte: now },
      },
    })

    let generated = 0

    for (const rj of dueJobs) {
      await db.job.create({
        data: {
          organizationId: rj.organizationId,
          customerId: rj.customerId,
          title: rj.title,
          status: 'draft',
          notes: rj.description || undefined,
          scheduledFor: rj.nextDueDate,
        },
      })

      const nextDueDate = calculateNextDueDate(rj.nextDueDate, rj.frequency)

      await db.recurringJob.update({
        where: { id: rj.id },
        data: {
          lastGeneratedAt: now,
          nextDueDate,
        },
      })

      generated++
    }

    return NextResponse.json({ success: true, generated })
  } catch (error) {
    console.error('Recurring job generation error:', error)
    return NextResponse.json({ error: 'Recurring job generation failed' }, { status: 500 })
  }
}

function calculateNextDueDate(current: Date, frequency: string): Date {
  const next = new Date(current)

  switch (frequency) {
    case 'monthly':
      next.setMonth(next.getMonth() + 1)
      break
    case 'quarterly':
      next.setMonth(next.getMonth() + 3)
      break
    case 'biannual':
      next.setMonth(next.getMonth() + 6)
      break
    case 'annual':
      next.setFullYear(next.getFullYear() + 1)
      break
    default:
      next.setMonth(next.getMonth() + 1)
  }

  return next
}
