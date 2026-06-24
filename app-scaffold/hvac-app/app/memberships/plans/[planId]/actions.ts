'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { trackEvent } from '@/lib/events'
import { logAudit } from '@/lib/audit'
import { revalidatePath } from 'next/cache'

type ToggleResult =
  | { success: true; isActive: boolean }
  | { success: false; error: string }

export async function toggleMembershipPlanActive(planId: string): Promise<ToggleResult> {
  const session = await auth()
  if (!session?.user?.id) {
    return { success: false, error: 'You must be logged in' }
  }

  const membership = await db.organizationMember.findFirst({ where: { userId: session.user.id } })
  if (!membership) {
    return { success: false, error: 'You must belong to an organization' }
  }
  const organizationId = membership.organizationId

  const plan = await db.membershipPlan.findFirst({ where: { id: planId, organizationId } })
  if (!plan) {
    return { success: false, error: 'Plan not found' }
  }

  const updated = await db.membershipPlan.update({
    where: { id: planId },
    data: { isActive: !plan.isActive },
  })

  await trackEvent({
    organizationId,
    userId: session.user.id,
    eventName: updated.isActive ? 'membership_plan_activated' : 'membership_plan_retired',
    entityType: 'membership_plan',
    entityId: planId,
  })
  await logAudit({
    organizationId,
    actorId: session.user.id,
    eventType: updated.isActive ? 'membership_plan_activated' : 'membership_plan_retired',
    targetType: 'membership_plan',
    targetId: planId,
    metadata: { name: plan.name },
  })

  revalidatePath('/memberships')
  revalidatePath(`/memberships/plans/${planId}`)

  return { success: true, isActive: updated.isActive }
}
