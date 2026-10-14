'use server'

import { requireMutationAccess, jobAccessWhere } from '@/lib/mutation-access'
import { db } from '@/lib/db'
import { trackEvent } from '@/lib/events'
import { recordProofOfWorkSchema } from '@/lib/validations/proof-of-work'

type RecordResult =
  | { success: true }
  | { success: false; error: string }

export async function recordProofOfWork(jobId: string, formData: FormData): Promise<RecordResult> {
  const access = await requireMutationAccess('fieldWork')
  if (!access.authorized) return { success: false, error: access.error }
  const { userId, organizationId } = access.context

  const job = await db.job.findFirst({
    where: { id: jobId, ...jobAccessWhere(access.context) },
  })
  if (!job) {
    return { success: false, error: 'Job not found in your organization' }
  }

  const raw = {
    workSummary: formData.get('workSummary'),
    materialsUsed: formData.get('materialsUsed') || undefined,
    completionNotes: formData.get('completionNotes') || undefined,
    technicianName: formData.get('technicianName') || undefined,
  }

  const parsed = recordProofOfWorkSchema.safeParse(raw)
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0].message }
  }

  const data = parsed.data

  await db.job.update({
    where: { id: jobId },
    data: {
      workSummary: data.workSummary,
      materialsUsed: data.materialsUsed || null,
      completionNotes: data.completionNotes || null,
      technicianName: data.technicianName || job.technicianName,
      status: 'completed',
      completedAt: job.completedAt || new Date(),
    },
  })

  await trackEvent({
    organizationId,
    userId,
    eventName: 'job_marked_completed',
    entityType: 'job',
    entityId: jobId,
  })

  return { success: true }
}
