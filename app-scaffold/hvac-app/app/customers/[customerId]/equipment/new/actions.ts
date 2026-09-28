'use server'

import { requireMutationAccess } from '@/lib/mutation-access'
import { db } from '@/lib/db'
import { trackEvent } from '@/lib/events'
import { createEquipmentSchema } from '@/lib/validations/equipment'

type Result = { success: true; equipmentId: string } | { success: false; error: string }

function parseDate(s: string | undefined): Date | null {
  if (!s) return null
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d
}

export async function createEquipment(formData: FormData): Promise<Result> {
  const access = await requireMutationAccess('manageCustomers')
  if (!access.authorized) return { success: false, error: access.error }
  const { session, userId, organizationId } = access.context

  const raw = {
    customerId: formData.get('customerId'),
    type: formData.get('type'),
    make: formData.get('make') || undefined,
    model: formData.get('model') || undefined,
    serial: formData.get('serial') || undefined,
    installDate: formData.get('installDate') || undefined,
    installedByUs: formData.get('installedByUs') === 'on',
    installerName: formData.get('installerName') || undefined,
    tonnage: formData.get('tonnage') || undefined,
    seer: formData.get('seer') || undefined,
    refrigerantType: formData.get('refrigerantType') || undefined,
    btu: formData.get('btu') || undefined,
    locationOnProperty: formData.get('locationOnProperty') || undefined,
    warrantyStartDate: formData.get('warrantyStartDate') || undefined,
    partsWarrantyMonths: formData.get('partsWarrantyMonths') || undefined,
    laborWarrantyMonths: formData.get('laborWarrantyMonths') || undefined,
    notes: formData.get('notes') || undefined,
  }

  const parsed = createEquipmentSchema.safeParse(raw)
  if (!parsed.success) return { success: false, error: parsed.error.errors[0].message }

  const data = parsed.data

  const customer = await db.customer.findFirst({
    where: { id: data.customerId, organizationId, deletedAt: null },
  })
  if (!customer) return { success: false, error: 'Customer not found' }

  const equipment = await db.equipment.create({
    data: {
      organizationId,
      customerId: data.customerId,
      type: data.type,
      make: data.make ?? null,
      model: data.model ?? null,
      serial: data.serial ?? null,
      installDate: parseDate(data.installDate),
      installedByUs: data.installedByUs ?? false,
      installerName: data.installerName ?? null,
      tonnage: data.tonnage ?? null,
      seer: data.seer ?? null,
      refrigerantType: data.refrigerantType ?? null,
      btu: data.btu ?? null,
      locationOnProperty: data.locationOnProperty ?? null,
      warrantyStartDate: parseDate(data.warrantyStartDate),
      partsWarrantyMonths: data.partsWarrantyMonths ?? null,
      laborWarrantyMonths: data.laborWarrantyMonths ?? null,
      notes: data.notes ?? null,
    },
  })

  await trackEvent({
    organizationId,
    userId: session.user.id,
    eventName: 'equipment_added',
    entityType: 'equipment',
    entityId: equipment.id,
    metadataJson: { customerId: data.customerId, type: data.type },
  })

  return { success: true, equipmentId: equipment.id }
}
