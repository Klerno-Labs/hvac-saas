'use server'

import { db } from '@/lib/db'
import { trackEvent } from '@/lib/events'
import { logAudit } from '@/lib/audit'
import { requireDispatchEditor } from '@/lib/dispatch'
import { createTechnicianSchema, updateTechnicianSchema } from '@/lib/validations/dispatch'

type Result = { success: true } | { success: false; error: string }

const PALETTE = [
  '#3b82f6', '#ef4444', '#22c55e', '#eab308',
  '#a855f7', '#ec4899', '#14b8a6', '#f97316',
]

export async function createTechnician(formData: FormData): Promise<Result & { technicianId?: string }> {
  const res = await requireDispatchEditor()
  if (!res.authorized) return { success: false, error: res.error }
  const { userId, organizationId } = res.context

  const parsed = createTechnicianSchema.safeParse({
    name: formData.get('name'),
    color: formData.get('color') || undefined,
  })
  if (!parsed.success) return { success: false, error: parsed.error.errors[0].message }

  const color =
    parsed.data.color && parsed.data.color.length > 0
      ? parsed.data.color
      : PALETTE[Math.floor(Math.random() * PALETTE.length)]

  const tech = await db.technician.create({
    data: { organizationId, name: parsed.data.name, color },
  })

  await trackEvent({
    organizationId,
    userId,
    eventName: 'technician_created',
    entityType: 'technician',
    entityId: tech.id,
    metadataJson: { name: tech.name },
  })
  await logAudit({
    organizationId,
    actorId: userId,
    eventType: 'technician_created',
    targetType: 'technician',
    targetId: tech.id,
    metadata: { name: tech.name },
  })

  return { success: true, technicianId: tech.id }
}

export async function updateTechnician(
  technicianId: string,
  formData: FormData
): Promise<Result> {
  const res = await requireDispatchEditor()
  if (!res.authorized) return { success: false, error: res.error }
  const { userId, organizationId } = res.context

  const rawActive = formData.get('active')
  const parsed = updateTechnicianSchema.safeParse({
    name: formData.get('name') || undefined,
    color: formData.get('color') || undefined,
    active:
      rawActive === 'true' ? true : rawActive === 'false' ? false : undefined,
  })
  if (!parsed.success) return { success: false, error: parsed.error.errors[0].message }

  const tech = await db.technician.findFirst({ where: { id: technicianId, organizationId } })
  if (!tech) return { success: false, error: 'Technician not found' }

  const data: Record<string, unknown> = {}
  if (parsed.data.name) data.name = parsed.data.name
  if (parsed.data.color && parsed.data.color.length > 0) data.color = parsed.data.color
  if (parsed.data.active !== undefined) data.active = parsed.data.active

  if (Object.keys(data).length === 0) return { success: true }

  await db.technician.update({ where: { id: technicianId }, data })

  await trackEvent({
    organizationId,
    userId,
    eventName: 'technician_updated',
    entityType: 'technician',
    entityId: technicianId,
    metadataJson: data,
  })

  return { success: true }
}
