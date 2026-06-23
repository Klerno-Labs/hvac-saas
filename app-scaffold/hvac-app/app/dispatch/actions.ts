'use server'

import { db } from '@/lib/db'
import { trackEvent } from '@/lib/events'
import { requireDispatchEditor } from '@/lib/dispatch'
import { assignJobSchema } from '@/lib/validations/dispatch'

type Result = { success: true } | { success: false; error: string }

/**
 * Assign a job to a technician at a specific time. Called from the dispatch
 * board drag-and-drop. `scheduledFor` is an ISO string precomputed server-side
 * for the dropped cell (org-timezone aware).
 */
export async function assignJob(input: {
  jobId: string
  technicianId: string
  scheduledFor: string
}): Promise<Result> {
  const res = await requireDispatchEditor()
  if (!res.authorized) return { success: false, error: res.error }
  const { userId, organizationId } = res.context

  const parsed = assignJobSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.errors[0].message }
  const { jobId, technicianId, scheduledFor } = parsed.data

  const job = await db.job.findFirst({ where: { id: jobId, organizationId } })
  if (!job) return { success: false, error: 'Job not found in your organization' }

  const tech = await db.technician.findFirst({ where: { id: technicianId, organizationId } })
  if (!tech) return { success: false, error: 'Technician not found in your organization' }

  await db.job.update({
    where: { id: jobId },
    data: {
      technicianId,
      scheduledFor: new Date(scheduledFor),
      status: job.status === 'draft' ? 'scheduled' : job.status,
    },
  })

  await trackEvent({
    organizationId,
    userId,
    eventName: 'job_assigned',
    entityType: 'job',
    entityId: jobId,
    metadataJson: {
      technicianId,
      technicianName: tech.name,
      scheduledFor,
      fromTechnicianId: job.technicianId ?? null,
    },
  })

  return { success: true }
}

/**
 * Remove a job from the board (clear technician + scheduled time), returning
 * it to the unscheduled queue.
 */
export async function unassignJob(jobId: string): Promise<Result> {
  const res = await requireDispatchEditor()
  if (!res.authorized) return { success: false, error: res.error }
  const { userId, organizationId } = res.context

  const job = await db.job.findFirst({ where: { id: jobId, organizationId } })
  if (!job) return { success: false, error: 'Job not found in your organization' }

  await db.job.update({
    where: { id: jobId },
    data: { technicianId: null, scheduledFor: null },
  })

  await trackEvent({
    organizationId,
    userId,
    eventName: 'job_unassigned',
    entityType: 'job',
    entityId: jobId,
    metadataJson: {
      fromTechnicianId: job.technicianId ?? null,
      fromScheduledFor: job.scheduledFor?.toISOString() ?? null,
    },
  })

  return { success: true }
}
