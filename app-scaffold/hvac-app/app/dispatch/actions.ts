'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { assignJobSchema } from '@/lib/validations/dispatch'

type Result = { success: true } | { success: false; error: string }

export async function assignJob(input: unknown): Promise<Result> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, error: 'Unauthorized' }

  const membership = await db.organizationMember.findFirst({
    where: { userId: session.user.id },
  })
  if (!membership) return { success: false, error: 'No organization' }

  if (membership.role === 'member') {
    return { success: false, error: 'Only owners can assign jobs on the dispatch board' }
  }

  const parsed = assignJobSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0].message }
  }

  const { jobId, technicianId, scheduledFor } = parsed.data

  const job = await db.job.findFirst({
    where: { id: jobId, organizationId: membership.organizationId },
    select: { id: true },
  })
  if (!job) return { success: false, error: 'Job not found' }

  if (technicianId) {
    const techMember = await db.organizationMember.findFirst({
      where: { userId: technicianId, organizationId: membership.organizationId },
    })
    if (!techMember) return { success: false, error: 'Technician not in this organization' }
  }

  await db.job.update({
    where: { id: jobId },
    data: {
      technicianId,
      scheduledFor: scheduledFor ? new Date(scheduledFor) : null,
    },
  })

  return { success: true }
}
