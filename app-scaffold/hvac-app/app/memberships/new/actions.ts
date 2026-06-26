'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'

export async function getCustomerEquipment(customerId: string) {
  const session = await auth()
  if (!session?.user?.id) return []

  const orgMember = await db.organizationMember.findFirst({ where: { userId: session.user.id } })
  if (!orgMember) return []

  return db.equipment.findMany({
    where: { organizationId: orgMember.organizationId, customerId },
    select: { id: true, type: true, make: true, model: true },
    orderBy: { createdAt: 'asc' },
  })
}
