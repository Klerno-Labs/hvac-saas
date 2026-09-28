'use server'

import { requireMutationAccess } from '@/lib/mutation-access'
import { db } from '@/lib/db'
import { trackEvent } from '@/lib/events'
import { REMINDER_STATUSES } from '@/lib/validations/reminder'

type ActionResult =
  | { success: true }
  | { success: false; error: string }

export async function updateReminderStatus(
  reminderId: string,
  status: string,
): Promise<ActionResult> {
  const access = await requireMutationAccess('manageJobs')
  if (!access.authorized) return { success: false, error: access.error }
  const { userId, organizationId } = access.context

  if (!REMINDER_STATUSES.includes(status as typeof REMINDER_STATUSES[number])) {
    return { success: false, error: 'Invalid reminder status' }
  }

  const reminder = await db.reminder.findFirst({
    where: { id: reminderId, organizationId },
  })
  if (!reminder) {
    return { success: false, error: 'Reminder not found in your organization' }
  }

  await db.reminder.update({
    where: { id: reminderId },
    data: { status },
  })

  const eventName = status === 'completed' ? 'reminder_completed' : 'reminder_dismissed'
  await trackEvent({
    organizationId,
    userId,
    eventName,
    entityType: 'reminder',
    entityId: reminderId,
  })

  return { success: true }
}
