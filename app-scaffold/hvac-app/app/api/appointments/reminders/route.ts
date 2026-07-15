import { NextResponse } from 'next/server'
import { runAppointmentReminders } from '@/lib/appointment-reminders'

export const runtime = 'nodejs'

/**
 * POST /api/appointments/reminders
 *
 * Sends day-ahead appointment reminder emails/SMS for all jobs scheduled
 * in the next 24 hours. Intended to be called hourly by the Vercel cron.
 * Protected by the shared COLLECTIONS_CRON_SECRET.
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
    const result = await runAppointmentReminders()
    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    console.error('Appointment reminders error:', error)
    return NextResponse.json({ error: 'Appointment reminders failed' }, { status: 500 })
  }
}
