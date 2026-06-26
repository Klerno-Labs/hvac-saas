'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { trackEvent } from '@/lib/events'
import { createMembershipPlanSchema } from '@/lib/validations/membership'

type CreateMembershipPlanResult =
  | { success: true; planId: string }
  | { success: false; error: string }

export async function createMembershipPlan(
  formData: FormData,
): Promise<CreateMembershipPlanResult> {
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
    name: formData.get('name'),
    description: formData.get('description') || undefined,
    cadence: formData.get('cadence'),
    visitsPerYear: formData.get('visitsPerYear'),
    priceCents: formData.get('priceCents'),
  }

  const parsed = createMembershipPlanSchema.safeParse(raw)
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0].message }
  }

  const data = parsed.data

  const plan = await db.membershipPlan.create({
    data: {
      organizationId,
      name: data.name,
      description: data.description || null,
      cadence: data.cadence,
      visitsPerYear: data.visitsPerYear,
      priceCents: data.priceCents,
      isActive: true,
    },
  })

  await trackEvent({
    organizationId,
    userId,
    eventName: 'membership_plan_created',
    entityType: 'membership_plan',
    entityId: plan.id,
  })

  return { success: true, planId: plan.id }
}
