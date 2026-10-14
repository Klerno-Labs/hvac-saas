'use server'

import { requireMutationAccess } from '@/lib/mutation-access'
import { db } from '@/lib/db'
import { trackEvent } from '@/lib/events'
import { logAudit } from '@/lib/audit'
import { createJobSchema } from '@/lib/validations/job'

type CreateJobResult =
  | { success: true; jobId: string }
  | { success: false; error: string }

export async function createJob(formData: FormData): Promise<CreateJobResult> {
  const access = await requireMutationAccess('manageJobs')
  if (!access.authorized) return { success: false, error: access.error }
  const { session, userId, organizationId } = access.context

  const raw = {
    customerId: formData.get('customerId'),
    title: formData.get('title'),
    notes: formData.get('notes') || undefined,
    scheduledFor: formData.get('scheduledFor') || undefined,
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

  const job = await db.job.create({
    data: {
      organizationId,
      customerId: data.customerId,
      title: data.title,
      notes: data.notes || null,
      scheduledFor: data.scheduledFor ? new Date(data.scheduledFor) : null,
      status: 'draft',
    },
  })

  await trackEvent({
    organizationId,
    userId,
    eventName: 'job_created',
    entityType: 'job',
    entityId: job.id,
  })

  try {
    await logAudit({
      organizationId,
      actorId: userId,
      actorEmail: session.user.email ?? undefined,
      eventType: 'job.created',
      targetType: 'job',
      targetId: job.id,
      metadata: { customerId: data.customerId, title: data.title, status: 'draft' },
    })
  } catch { /* best-effort */ }

  return { success: true, jobId: job.id }
}
