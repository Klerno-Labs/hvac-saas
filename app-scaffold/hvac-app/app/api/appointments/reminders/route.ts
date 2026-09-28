import { rejectUnauthorizedCron } from '@/lib/cron-auth'
import { NextResponse } from 'next/server'
import { runAppointmentReminders } from '@/lib/appointment-reminders'
import { reportScheduledFailure } from '@/lib/scheduled-monitoring'

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
    const success = result.errors === 0
    if (!success) await reportScheduledFailure('appointments', true)
    // Keep completed/partial runs inspectable without instructing a caller to
    // replay the whole batch after some recipients already accepted delivery.
    return NextResponse.json({ success, ...result }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    console.error('Appointment reminders failed')
    await reportScheduledFailure('appointments')
    return NextResponse.json({ error: 'Appointment reminders failed' }, { status: 500, headers: { 'Cache-Control': 'no-store' } })
  }
}

// Preserve authenticated manual/external-scheduler calls.
export const POST = GET
