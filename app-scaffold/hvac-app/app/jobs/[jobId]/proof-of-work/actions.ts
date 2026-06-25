'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { trackEvent } from '@/lib/events'
import { recordProofOfWorkSchema } from '@/lib/validations/proof-of-work'

type RecordResult =
  | { success: true }
  | { success: false; error: string }

export async function recordProofOfWork(jobId: string, formData: FormData): Promise<RecordResult> {
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

  const job = await db.job.findFirst({
    where: { id: jobId, organizationId },
  })
  if (!job) {
    return { success: false, error: 'Job not found in your organization' }
  }

  const raw = {
    workSummary: formData.get('workSummary'),
    materialsUsed: formData.get('materialsUsed') || undefined,
    completionNotes: formData.get('completionNotes') || undefined,
    technicianId: formData.get('technicianId') || undefined,
  }

  const parsed = recordProofOfWorkSchema.safeParse(raw)
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0].message }
  }

  const data = parsed.data

  if (data.technicianId) {
    const tech = await db.technician.findFirst({
      where: { id: data.technicianId, organizationId },
    })
    if (!tech) {
      return { success: false, error: 'Technician not found in your organization' }
    }
  }

  await db.job.update({
    where: { id: jobId },
    data: {
      workSummary: data.workSummary,
      materialsUsed: data.materialsUsed || null,
      completionNotes: data.completionNotes || null,
      ...(data.technicianId ? { technicianId: data.technicianId } : {}),
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
