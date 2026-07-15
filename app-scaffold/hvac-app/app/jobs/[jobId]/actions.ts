'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { trackEvent } from '@/lib/events'
import { logAudit } from '@/lib/audit'
import { updateJobStatusSchema } from '@/lib/validations/job'

type UpdateStatusResult =
  | { success: true }
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
  } catch (_e) { /* best-effort */ }

  return { success: true }
}
