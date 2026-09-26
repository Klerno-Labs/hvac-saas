import { rejectUnauthorizedCron } from '@/lib/cron-auth'
import { NextResponse } from 'next/server'
import { runAppointmentReminders } from '@/lib/appointment-reminders'

export const runtime = 'nodejs'

/**
 * GET or POST /api/appointments/reminders
 *
 * Sends day-ahead appointment reminder emails/SMS for all jobs scheduled
 * tomorrow in each business's time zone. Configured to run daily.
 * Protected by CRON_SECRET or the legacy COLLECTIONS_CRON_SECRET.
 */
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const denied = rejectUnauthorizedCron(req)
  if (denied) return denied

  try {
    const result = await runAppointmentReminders()
    return NextResponse.json({ success: true, ...result }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('Appointment reminders error:', error)
    return NextResponse.json({ error: 'Appointment reminders failed' }, { status: 500, headers: { 'Cache-Control': 'no-store' } })
  }
}

// Preserve authenticated manual/external-scheduler calls.
export const POST = GET
