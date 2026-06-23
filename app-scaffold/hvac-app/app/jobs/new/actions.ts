'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { trackEvent } from '@/lib/events'
import { createJobSchema } from '@/lib/validations/job'

type CreateJobResult =
  | { success: true; jobId: string }
  | { success: false; error: string }

export async function createJob(formData: FormData): Promise<CreateJobResult> {
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

  const raw = {
    customerId: formData.get('customerId'),
    title: formData.get('title'),
    notes: formData.get('notes') || undefined,
    scheduledFor: formData.get('scheduledFor') || undefined,
    technicianMemberId: formData.get('technicianMemberId') || undefined,
  }

  const parsed = createJobSchema.safeParse(raw)
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0].message }
  }

  const data = parsed.data

  // Verify customer belongs to the same organization
  const customer = await db.customer.findFirst({
    where: { id: data.customerId, organizationId },
  })
  if (!customer) {
    return { success: false, error: 'Customer not found in your organization' }
  }

  // Resolve the assigned technician (must be a member of this org)
  let technicianUserId: string | null = null
  let technicianName: string | null = null
  if (data.technicianMemberId) {
    const member = await db.organizationMember.findFirst({
      where: { id: data.technicianMemberId, organizationId },
      include: { user: { select: { name: true, email: true } } },
    })
    if (!member) {
      return { success: false, error: 'Selected technician is not a member of your organization' }
    }
    technicianUserId = member.userId
    technicianName = member.user.name || member.user.email || null
  }

  const job = await db.job.create({
    data: {
      organizationId,
      customerId: data.customerId,
      title: data.title,
      notes: data.notes || null,
      scheduledFor: data.scheduledFor ? new Date(data.scheduledFor) : null,
      status: data.scheduledFor ? 'scheduled' : 'draft',
      technicianUserId,
      technicianName,
    },
  })

  await trackEvent({
    organizationId,
    userId,
    eventName: 'job_created',
    entityType: 'job',
    entityId: job.id,
  })

  return { success: true, jobId: job.id }
}
