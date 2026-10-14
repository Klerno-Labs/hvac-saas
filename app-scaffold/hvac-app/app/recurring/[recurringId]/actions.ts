'use server'

import { requireMutationAccess } from '@/lib/mutation-access'
import { db } from '@/lib/db'
import { trackEvent } from '@/lib/events'
import { revalidatePath } from 'next/cache'

type ToggleResult =
  | { success: true; isActive: boolean }
  | { success: false; error: string }

export async function toggleRecurringJob(recurringId: string): Promise<ToggleResult> {
  const access = await requireMutationAccess('manageJobs')
  if (!access.authorized) return { success: false, error: access.error }
  const { userId, organizationId } = access.context

  const recurringJob = await db.recurringJob.findFirst({
    where: { id: recurringId, organizationId },
  })
  if (!recurringJob) {
    return { success: false, error: 'Recurring job not found' }
  }

  const updated = await db.recurringJob.update({
    where: { id: recurringId },
    data: { isActive: !recurringJob.isActive },
  })

  await trackEvent({
    organizationId,
    userId,
    eventName: updated.isActive ? 'recurring_job_activated' : 'recurring_job_deactivated',
    entityType: 'recurring_job',
    entityId: recurringId,
  })

  revalidatePath(`/recurring/${recurringId}`)
  revalidatePath('/recurring')

  return { success: true, isActive: updated.isActive }
}
