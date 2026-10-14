'use server'

import { canDo } from '@/lib/permissions'

import { requireMutationAccess, jobAccessWhere } from '@/lib/mutation-access'
import { db } from '@/lib/db'
import { trackEvent } from '@/lib/events'
import { logAudit } from '@/lib/audit'
import { updateJobStatusSchema } from '@/lib/validations/job'

type UpdateStatusResult =
  | { success: true }
  | { success: false; error: string }

export async function updateJobStatus(jobId: string, formData: FormData): Promise<UpdateStatusResult> {
  const access = await requireMutationAccess('fieldWork')
  if (!access.authorized) return { success: false, error: access.error }
  const { session, userId, organizationId } = access.context

  // Verify job belongs to the user's organization
  const job = await db.job.findFirst({
    where: { id: jobId, ...jobAccessWhere(access.context) },
  })
  if (!job) {
    return { success: false, error: 'Job not found in your organization' }
  }

  const parsed = updateJobStatusSchema.safeParse({ status: formData.get('status') })
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0].message }
  }

  const { status } = parsed.data
  if (!canDo(access.context.role, 'manageJobs') && !['scheduled', 'in_progress', 'completed'].includes(status)) {
    return { success: false, error: 'Only dispatch staff can book, cancel or reopen a job' }
  }

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

  try {
    await logAudit({
      organizationId,
      actorId: userId,
      actorEmail: session.user.email ?? undefined,
      eventType: 'job.updated',
      targetType: 'job',
      targetId: jobId,
      metadata: { before: { status: job.status }, after: { status } },
    })
  } catch { /* best-effort */ }

  return { success: true }
}
