import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { sendSms } from '@/lib/sms'

export const runtime = 'nodejs'

/**
 * GET /api/reminders/send
 *
 * Sends SMS appointment reminders for jobs scheduled in the next hour.
 * The 1-hour look-ahead window means each job is picked up by exactly one
 * hourly cron run, providing natural idempotency without schema changes.
 * Protected by COLLECTIONS_CRON_SECRET (same secret as other cron routes).
 */
export async function GET(req: Request) {
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
    const windowEnd = new Date(now.getTime() + 60 * 60 * 1000)

    const jobs = await db.job.findMany({
      where: {
        scheduledFor: { gt: now, lte: windowEnd },
        status: { notIn: ['cancelled', 'completed'] },
      },
      include: {
        customer: { select: { phone: true, firstName: true, lastName: true } },
        organization: { select: { name: true } },
      },
    })

    let sent = 0

    for (const job of jobs) {
      const phone = job.customer.phone
      if (!phone) continue

      const customerName = [job.customer.firstName, job.customer.lastName]
        .filter(Boolean)
        .join(' ')

      const scheduledTime = job.scheduledFor!.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
      })

      const result = await sendSms(
        phone,
        `Hi ${customerName}, this is a reminder from ${job.organization.name} about your appointment today at ${scheduledTime}. See you soon!`,
      )

      if (result.success) sent++
    }

    return NextResponse.json({ success: true, sent })
  } catch (error) {
    console.error('Appointment reminder error:', error)
    return NextResponse.json({ error: 'Appointment reminder run failed' }, { status: 500 })
  }
}
