'use server'

import { requireMutationAccess } from '@/lib/mutation-access'
import { db } from '@/lib/db'
import { trackEvent } from '@/lib/events'
import { createReminderSchema } from '@/lib/validations/reminder'

type CreateReminderResult =
  | { success: true; reminderId: string }
  | { success: false; error: string }

export async function createReminder(formData: FormData): Promise<CreateReminderResult> {
  const access = await requireMutationAccess('manageJobs')
  if (!access.authorized) return { success: false, error: access.error }
  const { userId, organizationId } = access.context

  const raw = {
    title: formData.get('title'),
    notes: formData.get('notes') || undefined,
    reminderType: formData.get('reminderType') || 'general',
    dueAt: formData.get('dueAt') || undefined,
    jobId: formData.get('jobId') || undefined,
    customerId: formData.get('customerId') || undefined,
    estimateId: formData.get('estimateId') || undefined,
    invoiceId: formData.get('invoiceId') || undefined,
  }

  const parsed = createReminderSchema.safeParse(raw)
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0].message }
  }

  const data = parsed.data

  // Validate linked entities belong to same organization
  if (data.jobId) {
    const job = await db.job.findFirst({ where: { id: data.jobId, organizationId } })
    if (!job) return { success: false, error: 'Job not found in your organization' }
  }
  if (data.customerId) {
    const customer = await db.customer.findFirst({ where: { id: data.customerId, organizationId } })
    if (!customer) return { success: false, error: 'Customer not found in your organization' }
  }
  if (data.estimateId) {
    const estimate = await db.estimate.findFirst({ where: { id: data.estimateId, organizationId } })
    if (!estimate) return { success: false, error: 'Estimate not found in your organization' }
  }
  if (data.invoiceId) {
    const invoice = await db.invoice.findFirst({ where: { id: data.invoiceId, organizationId } })
    if (!invoice) return { success: false, error: 'Invoice not found in your organization' }
  }

  const reminder = await db.reminder.create({
    data: {
      organizationId,
      title: data.title,
      notes: data.notes || null,
      reminderType: data.reminderType,
      dueAt: data.dueAt ? new Date(data.dueAt) : null,
      jobId: data.jobId || null,
      customerId: data.customerId || null,
      estimateId: data.estimateId || null,
      invoiceId: data.invoiceId || null,
      status: 'open',
    },
  })

  await trackEvent({
    organizationId,
    userId,
    eventName: 'reminder_created',
    entityType: 'reminder',
    entityId: reminder.id,
  })

  return { success: true, reminderId: reminder.id }
}
