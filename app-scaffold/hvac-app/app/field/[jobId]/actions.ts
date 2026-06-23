'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { trackEvent } from '@/lib/events'
import { updateFieldStatusSchema, saveTechnicianNotesSchema } from '@/lib/validations/field'
import { resolveJobStatusForField, isFieldStatus } from '@/lib/field'

type ActionResult = { success: true } | { success: false; error: string }

/**
 * Load the current user's assigned job, verifying org + technician assignment.
 * Returns null when the job does not exist or is not assigned to this technician.
 *
 * This is the RBAC boundary for the field hub: a technician can only act on
 * jobs where `technicianUserId === userId` within their own organization.
 */
async function getAssignedJob(jobId: string) {
  const session = await auth()
  if (!session?.user?.id) return { error: 'You must be logged in' as const }

  const userId = session.user.id
  const membership = await db.organizationMember.findFirst({ where: { userId } })
  if (!membership) return { error: 'You must belong to an organization' as const }

  const job = await db.job.findFirst({
    where: { id: jobId, organizationId: membership.organizationId, technicianUserId: userId },
  })
  if (!job) return { error: 'Job not found or not assigned to you' as const }

  return { job, organizationId: membership.organizationId, userId } as const
}

export async function updateFieldStatus(jobId: string, formData: FormData): Promise<ActionResult> {
  const ctx = await getAssignedJob(jobId)
  if ('error' in ctx) return { success: false, error: ctx.error }
  const { job, organizationId, userId } = ctx

  const parsed = updateFieldStatusSchema.safeParse({ fieldStatus: formData.get('fieldStatus') })
  if (!parsed.success) return { success: false, error: parsed.error.errors[0].message }

  const next = parsed.data.fieldStatus
  if (!isFieldStatus(next)) return { success: false, error: 'Invalid field status' }

  const nextJobStatus = resolveJobStatusForField(next, job.status)
  const now = new Date()

  await db.job.update({
    where: { id: jobId },
    data: {
      fieldStatus: next,
      status: nextJobStatus,
      completedAt: next === 'done' ? (job.completedAt ?? now) : job.completedAt,
    },
  })

  await trackEvent({
    organizationId,
    userId,
    eventName: 'field_status_updated',
    entityType: 'job',
    entityId: jobId,
    metadataJson: { from: job.fieldStatus, to: next, jobStatus: nextJobStatus },
  })

  return { success: true }
}

export async function saveTechnicianNotes(jobId: string, formData: FormData): Promise<ActionResult> {
  const ctx = await getAssignedJob(jobId)
  if ('error' in ctx) return { success: false, error: ctx.error }
  const { organizationId, userId } = ctx

  const parsed = saveTechnicianNotesSchema.safeParse({ notes: formData.get('notes') ?? '' })
  if (!parsed.success) return { success: false, error: parsed.error.errors[0].message }

  await db.job.update({
    where: { id: jobId },
    data: { technicianNotes: parsed.data.notes || null },
  })

  await trackEvent({
    organizationId,
    userId,
    eventName: 'field_technician_notes_saved',
    entityType: 'job',
    entityId: jobId,
  })

  return { success: true }
}
