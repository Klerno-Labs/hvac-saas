'use server'

import { requireActiveSubscription } from '@/lib/session'
import { db } from '@/lib/db'

export async function getCustomerEquipment(customerId: string) {
  const { organizationId } = await requireActiveSubscription()
  return db.equipment.findMany({
    where: { organizationId, customerId, status: 'active' },
    select: { id: true, type: true, make: true, model: true, serial: true },
    orderBy: { createdAt: 'asc' },
  })
}
