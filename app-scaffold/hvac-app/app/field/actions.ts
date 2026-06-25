'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { trackEvent } from '@/lib/events'
import type { FieldJobStatus } from '@/lib/field/types'

type ActionResult = { success: true } | { success: false; error: string }

const FIELD_STATUSES: FieldJobStatus[] = ['scheduled', 'in_progress', 'completed']

export async function updateFieldJobStatus(
  jobId: string,
  status: FieldJobStatus,
): Promise<ActionResult> {
  if (!FIELD_STATUSES.includes(status)) {
    return { success: false, error: 'Invalid field status' }
  }

  const session = await auth()
  if (!session?.user?.id) return { success: false, error: 'Not authenticated' }

  const membership = await db.organizationMember.findFirst({
    where: { userId: session.user.id },
  })
  if (!membership) return { success: false, error: 'No organization membership' }

  const job = await db.job.findFirst({
    where: { id: jobId, organizationId: membership.organizationId },
  })
  if (!job) return { success: false, error: 'Job not found' }

  await db.job.update({
    where: { id: jobId },
    data: {
      status,
      completedAt: status === 'completed' ? (job.completedAt ?? new Date()) : job.completedAt,
    },
  })

  await trackEvent({
    organizationId: membership.organizationId,
    userId: session.user.id,
    eventName: 'job_status_updated',
    entityType: 'job',
    entityId: jobId,
    metadataJson: { from: job.status, to: status, source: 'field' },
  })

  revalidatePath('/field')
  return { success: true }
}

export async function addFieldNote(
  jobId: string,
  body: string,
  clientId: string,
): Promise<ActionResult> {
  if (!body.trim()) return { success: false, error: 'Note cannot be empty' }

  const session = await auth()
  if (!session?.user?.id) return { success: false, error: 'Not authenticated' }

  const membership = await db.organizationMember.findFirst({
    where: { userId: session.user.id },
  })
  if (!membership) return { success: false, error: 'No organization membership' }

  const job = await db.job.findFirst({
    where: { id: jobId, organizationId: membership.organizationId },
  })
  if (!job) return { success: false, error: 'Job not found' }

  await db.jobNote.upsert({
    where: { clientId },
    create: {
      clientId,
      organizationId: membership.organizationId,
      jobId,
      authorId: session.user.id,
      authorName: session.user.name ?? null,
      body: body.trim(),
    },
    update: {},
  })

  revalidatePath('/field')
  return { success: true }
}
