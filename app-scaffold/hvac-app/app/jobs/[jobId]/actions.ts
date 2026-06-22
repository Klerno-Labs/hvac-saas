'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { trackEvent } from '@/lib/events'
import { assignTechnicianSchema, updateJobStatusSchema } from '@/lib/validations/job'

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

  return { success: true }
}

export async function assignTechnician(jobId: string, formData: FormData): Promise<UpdateStatusResult> {
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

  const parsed = assignTechnicianSchema.safeParse({ technicianId: formData.get('technicianId') || undefined })
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0].message }
  }

  const data = parsed.data

  // Verify technician (if provided) belongs to the same organization.
  // An empty value clears the assignment.
  let technicianId: string | null = null
  if (data.technicianId) {
    const technician = await db.technician.findFirst({
      where: { id: data.technicianId, organizationId },
    })
    if (!technician) {
      return { success: false, error: 'Technician not found in your organization' }
    }
    technicianId = technician.id
  }

  await db.job.update({
    where: { id: jobId },
    data: { technicianId },
  })

  await trackEvent({
    organizationId,
    userId,
    eventName: 'job_technician_assigned',
    entityType: 'job',
    entityId: jobId,
    metadataJson: { from: job.technicianId, to: technicianId },
  })

  return { success: true }
}
