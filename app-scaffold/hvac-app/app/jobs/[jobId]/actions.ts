'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { trackEvent } from '@/lib/events'
import { sendJobCompletionNotice, type SendCompletionNoticeResult } from '@/lib/job-notifications'
import { updateJobStatusSchema } from '@/lib/validations/job'

type UpdateStatusResult =
  | { success: true; notice?: SendCompletionNoticeResult }
  | { success: false; error: string }

export async function updateJobStatus(jobId: string, formData: FormData): Promise<UpdateStatusResult> {
  const session = await auth()
  if (!session?.user?.id) {
    return { success: false, error: 'You must be logged in' }
  }

  const userId = session.user.id

  const membership = await db.organizationMember.findFirst({
    where: { userId },
  })
  if (!membership) {
    return { success: false, error: 'You must belong to an organization' }
  }

  const organizationId = membership.organizationId

  // Verify job belongs to the user's organization
  const job = await db.job.findFirst({
    where: { id: jobId, organizationId },
  })
  if (!job) {
    return { success: false, error: 'Job not found in your organization' }
  }

  const parsed = updateJobStatusSchema.safeParse({ status: formData.get('status') })
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0].message }
  }

  const { status } = parsed.data

  await db.job.update({
    where: { id: jobId },
    data: {
      status,
      completedAt: status === 'completed' ? new Date() : job.completedAt,
    },
  })

  await trackEvent({
    organizationId,
    userId,
    eventName: 'job_status_updated',
    entityType: 'job',
    entityId: jobId,
    metadataJson: { from: job.status, to: status },
  })

  // Fire the completion notice only on a transition INTO `completed`.
  // The notice is idempotent (guarded by Job.completionNoticeSentAt) and
  // best-effort, so a notification failure never blocks the status update.
  if (status === 'completed' && job.status !== 'completed') {
    try {
      const notice = await sendJobCompletionNotice({ organizationId, jobId, actorId: userId })
      return { success: true, notice }
    } catch (error) {
      console.error('[job-completion-notice]', error)
    }
  }

  return { success: true }
}
