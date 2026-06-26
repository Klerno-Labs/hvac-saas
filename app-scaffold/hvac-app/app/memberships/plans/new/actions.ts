'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { trackEvent } from '@/lib/events'
import { createMembershipPlanSchema } from '@/lib/validations/membership'

type Result = { success: true } | { success: false; error: string }

export async function createMembershipPlan(formData: FormData): Promise<Result> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, error: 'You must be logged in' }

  const orgMember = await db.organizationMember.findFirst({
    where: { userId: session.user.id },
  })
  if (!orgMember) return { success: false, error: 'You must belong to an organization' }

  const raw = {
    name: formData.get('name'),
    description: formData.get('description') || undefined,
    cadence: formData.get('cadence'),
    visitsPerYear: formData.get('visitsPerYear'),
    price: formData.get('price'),
  }

  const parsed = createMembershipPlanSchema.safeParse(raw)
  if (!parsed.success) return { success: false, error: parsed.error.errors[0].message }

  const { name, description, cadence, visitsPerYear, price } = parsed.data

  const plan = await db.membershipPlan.create({
    data: {
      organizationId: orgMember.organizationId,
      name,
      description: description || null,
      cadence,
      visitsPerYear,
      priceCents: Math.round(price * 100),
    },
  })

  await trackEvent({
    organizationId: orgMember.organizationId,
    userId: session.user.id,
    eventName: 'membership_plan_created',
    entityType: 'membership_plan',
    entityId: plan.id,
  })

  return { success: true }
}
