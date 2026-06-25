'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { trackEvent } from '@/lib/events'
import { updateJobStatusSchema } from '@/lib/validations/job'
import { assertCanWrite, handleGuardError } from '@/lib/billing-guard'

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

  try {
    await assertCanWrite(organizationId)
  } catch (e) {
    const guard = handleGuardError(e)
    if (guard) return guard
    throw e
  }

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

  return { success: true }
}
